// Script để tạo tài khoản rover mới hoặc kiểm tra rover hiện có
// Chạy bằng lệnh: node create-rover.js

import sequelize from '../src/config/database.js';
import { Rover, Station, User } from '../src/models/index.js';
import bcrypt from 'bcrypt';
import { logger } from '../src/utils/logger.js';

async function createOrCheckRover() {
  try {
    await sequelize.authenticate();
    console.log('Đã kết nối đến cơ sở dữ liệu.');

    // Kiểm tra xem rover "rover1" đã tồn tại chưa
    let rover = await Rover.findOne({
      where: { username: 'rover1' },
      include: [
        { model: Station, attributes: ['id', 'name'] },
        { model: User, attributes: ['id', 'name', 'email'] }
      ]
    });

    if (rover) {
      console.log('Tài khoản rover đã tồn tại:');
      console.log(`- ID: ${rover.id}`);
      console.log(`- Username: ${rover.username}`);
      console.log(`- Status: ${rover.status}`);
      console.log(`- Station ID: ${rover.station_id}`);
      console.log(`- Station name: ${rover.Station ? rover.Station.name : 'N/A'}`);
      console.log(`- User ID: ${rover.user_id}`);
      console.log(`- User name: ${rover.User ? rover.User.name : 'N/A'}`);
      console.log(`- Last connection: ${rover.last_connection || 'N/A'}`);
      
      // Reset mật khẩu nếu cần
      const resetPassword = true; // Đặt thành false nếu không muốn reset mật khẩu
      
      if (resetPassword) {
        const newPassword = 'rover123';
        rover.password_hash = newPassword; // Sẽ được hash bởi hook trong model
        await rover.save();
        console.log(`Đã đặt lại mật khẩu cho rover '${rover.username}' thành '${newPassword}'`);
      }
    } else {
      // Tìm station HANOI_VRS
      const station = await Station.findOne({
        where: { name: 'HANOI_VRS' }
      });
      
      if (!station) {
        console.log('Không tìm thấy station HANOI_VRS. Vui lòng tạo station trước.');
        return;
      }
      
      // Tìm user admin đầu tiên
      const user = await User.findOne({
        where: { role: 'admin' }
      });
      
      if (!user) {
        console.log('Không tìm thấy user admin. Vui lòng tạo user trước.');
        return;
      }
      
      // Tạo rover mới
      rover = await Rover.create({
        username: 'rover1',
        password_hash: 'rover123', // Sẽ được hash bởi hook trong model
        station_id: station.id,
        user_id: user.id,
        status: 'active',
        description: 'Test Rover'
      });
      
      console.log(`Đã tạo tài khoản rover mới:`);
      console.log(`- ID: ${rover.id}`);
      console.log(`- Username: ${rover.username}`);
      console.log(`- Password: rover123`);
      console.log(`- Station ID: ${rover.station_id} (${station.name})`);
      console.log(`- User ID: ${rover.user_id} (${user.name})`);
    }
    
    // Kiểm tra phương thức validatePassword
    console.log('\nKiểm tra phương thức xác thực mật khẩu:');
    const testPass1 = await rover.validatePassword('rover123');
    const testPass2 = await rover.validatePassword('wrongpassword');
    
    console.log(`- Mật khẩu 'rover123': ${testPass1 ? 'Đúng ✅' : 'Sai ❌'}`);
    console.log(`- Mật khẩu 'wrongpassword': ${testPass2 ? 'Đúng ❌' : 'Sai ✅'}`);

  } catch (error) {
    console.error('Lỗi:', error);
  } finally {
    await sequelize.close();
    console.log('Đã đóng kết nối đến cơ sở dữ liệu.');
  }
}

createOrCheckRover();
