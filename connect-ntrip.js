// NTRIP Client Test Script
// Lưu thành file connect-ntrip.js và chạy bằng node connect-ntrip.js

import { Socket } from 'net';

// Cấu hình kết nối
const config = {
    host: 'localhost',
    port: 9001,         // Cập nhật cổng thành 9001 để khớp với NTRIP caster đang chạy
    mountpoint: 'HANOI_VRS', // Cập nhật mountpoint thành HANOI_VRS để khớp với trạm có sẵn
    username: 'rover1',
    password: 'rover123',
    sendNMEA: true,    // Đặt thành false nếu không muốn gửi NMEA
    sendInterval: 5000 // Gửi NMEA mỗi 5 giây
};

// Tạo kết nối TCP
console.log(`Đang kết nối đến ${config.host}:${config.port}/${config.mountpoint}...`);
const client = new Socket();

// Cấu hình cho kết nối bền vững
client.setKeepAlive(true, 10000);

// Xử lý sự kiện kết nối
client.on('connect', () => {
    console.log(`Đã kết nối thành công đến ${config.host}:${config.port}`);
    
    // Tạo yêu cầu HTTP
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    const request = 
        `GET /${config.mountpoint} HTTP/1.1\r\n` +
        `Host: ${config.host}:${config.port}\r\n` +
        `User-Agent: NTRIP Test Client 1.0\r\n` +
        `Authorization: Basic ${auth}\r\n` +
        `Accept: */*\r\n` +
        `Connection: keep-alive\r\n\r\n`;
    
    // Gửi yêu cầu HTTP
    client.write(request);
    console.log('Đã gửi yêu cầu HTTP với xác thực');
});

// Xử lý dữ liệu nhận được
let headerReceived = false;
let rtcmBytesReceived = 0;

client.on('data', (data) => {
    if (!headerReceived) {
        // Kiểm tra phần header HTTP
        const dataStr = data.toString();
        const headerEndIndex = dataStr.indexOf('\r\n\r\n');
        
        if (headerEndIndex !== -1) {
            // Hiển thị header
            const header = dataStr.substring(0, headerEndIndex);
            console.log('Phản hồi từ server:');
            console.log(header);
            
            // Kiểm tra xem kết nối có thành công không
            if (header.includes('200 OK')) {
                console.log('Kết nối NTRIP thành công!');
                headerReceived = true;
                
                // Kiểm tra xem có dữ liệu RTCM sau header không
                if (headerEndIndex + 4 < data.length) {
                    const rtcmData = data.slice(headerEndIndex + 4);
                    rtcmBytesReceived += rtcmData.length;
                    console.log(`Nhận được ${rtcmData.length} bytes dữ liệu RTCM`);
                }
                
                // Bắt đầu gửi NMEA nếu được cấu hình
                if (config.sendNMEA) {
                    sendNMEA();
                    setInterval(sendNMEA, config.sendInterval);
                }
            } else {
                console.log('Kết nối thất bại. Đang ngắt kết nối...');
                client.destroy();
            }
        }
    } else {
        // Đây là dữ liệu RTCM
        rtcmBytesReceived += data.length;
        console.log(`Nhận được ${data.length} bytes dữ liệu RTCM. Tổng cộng: ${rtcmBytesReceived} bytes`);
        
        // Phân tích một số thông tin cơ bản về gói tin RTCM
        analyzeRTCM(data);
    }
});

// Tạo và gửi câu NMEA GGA
function sendNMEA() {
    // Tạo thời gian hiện tại theo định dạng hhmmss.ss
    const now = new Date();
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    const time = `${hours}${minutes}${seconds}.00`;
    
    // Tọa độ Cầu Giấy, Hà Nội ở định dạng NMEA (DDMM.MMMM)
    const lat = '2103.6200';  // 21 độ 03.6200 phút Bắc
    const lon = '10547.4300'; // 105 độ 47.4300 phút Đông
    
    // Tạo câu NMEA GGA
    let nmea = [
        '$GPGGA',
        time,
        lat,
        'N',
        lon,
        'E',
        '4',              // Fix quality (4 = RTK fixed)
        '10',             // Số vệ tinh
        '1.0',            // HDOP
        '100.00',         // Độ cao
        'M',              // Đơn vị độ cao (mét)
        '0.0',            // Height of geoid above WGS84
        'M',              // Đơn vị (mét)
        '',               // Thời gian từ lần cập nhật DGPS cuối
        ''                // ID trạm tham chiếu DGPS
    ].join(',');
    
    // Tính checksum
    let checksum = 0;
    for (let i = 1; i < nmea.length; i++) {
        checksum ^= nmea.charCodeAt(i);
    }
    
    // Định dạng checksum thành hex và thêm vào cuối câu NMEA
    const checksumHex = checksum.toString(16).toUpperCase().padStart(2, '0');
    nmea += `*${checksumHex}\r\n`;
    
    // Gửi câu NMEA
    client.write(nmea);
    console.log(`Đã gửi NMEA: ${nmea.trim()}`);
}

// Phân tích dữ liệu RTCM cơ bản
function analyzeRTCM(data) {
    let index = 0;
    
    while (index < data.length) {
        // Tìm header RTCM3 (0xD3)
        if (data[index] === 0xD3) {
            // Kiểm tra xem có đủ byte để đọc độ dài không
            if (index + 3 > data.length) {
                break;
            }
            
            // Lấy message type (12 bits đầu tiên sau header byte)
            const messageType = ((data[index + 1] & 0xF0) >> 4) * 256 + ((data[index + 1] & 0x0F) * 16) + ((data[index + 2] & 0xF0) >> 4);
            
            // Lấy độ dài của message (10 bits tiếp theo)
            const messageLength = ((data[index + 2] & 0x03) << 8) | data[index + 3];
            
            console.log(`  RTCM3 message: Type ${messageType}, Length ${messageLength} bytes`);
            
            // Tùy thuộc vào message type, có thể phân tích thêm thông tin
            switch(messageType) {
                case 1004:
                    console.log('    - GPS Extended RTK, L1/L2');
                    break;
                case 1005:
                    console.log('    - Stationary RTK Reference Station ARP');
                    break;
                case 1007:
                    console.log('    - Antenna Descriptor');
                    break;
                case 1012:
                    console.log('    - GLONASS Extended RTK, L1/L2');
                    break;
                case 1230:
                    console.log('    - GLONASS Code-Phase Biases');
                    break;
                default:
                    console.log(`    - Message type ${messageType}`);
            }
            
            // Di chuyển đến message tiếp theo (3 byte header + message length + 3 byte CRC)
            index += messageLength + 6;
        } else {
            index++;
        }
    }
}

// Xử lý sự kiện lỗi
client.on('error', (err) => {
    console.log(`Lỗi: ${err.message}`);
});

// Xử lý sự kiện đóng kết nối
client.on('close', () => {
    console.log('Kết nối đã bị đóng. Đang thử kết nối lại sau 5 giây...');
    
    // Reset trạng thái header khi kết nối đóng
    headerReceived = false;
    
    // Thử kết nối lại sau 5 giây
    setTimeout(() => {
        console.log('Đang thử kết nối lại...');
        client.connect(config.port, config.host);
    }, 5000);
});

// Kết nối đến server
client.connect(config.port, config.host);

// Xử lý thoát từ bàn phím
process.on('SIGINT', () => {
    console.log('\nNgắt kết nối...');
    client.destroy();
    process.exit(0);
});
