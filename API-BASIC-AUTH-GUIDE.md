# Hướng dẫn sử dụng REST API với Basic Authentication

## Giới thiệu
API đã được chuyển đổi để sử dụng Basic Authentication thay vì JWT. Với cách thực hiện này, bạn có thể truy cập tất cả các API chỉ với một cặp username/password.

## Thông tin xác thực mặc định
```
Username: admin
Password: admin123
```

## Cách thực hiện Basic Authentication

### Sử dụng cURL
```bash
curl -X GET "http://localhost:3000/api/stations" -H "Authorization: Basic YWRtaW46YWRtaW4xMjM="
```

Trong đó: `YWRtaW46YWRtaW4xMjM=` là chuỗi Base64 của `admin:admin123`

### Sử dụng Postman
1. Chọn phương thức API (GET, POST, PUT, DELETE)
2. Nhập URL (ví dụ: http://localhost:3000/api/stations)
3. Trong tab "Authorization", chọn loại "Basic Auth"
4. Nhập Username: `admin` và Password: `admin123`
5. Bấm "Send" để gửi request

### Sử dụng Fetch API (JavaScript)
```javascript
const username = 'admin';
const password = 'admin123';
const authString = btoa(`${username}:${password}`);

fetch('http://localhost:3000/api/stations', {
  headers: {
    'Authorization': `Basic ${authString}`
  }
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
```

## Danh sách các API hiện có

### Quản lý người dùng
- **GET /api/users** - Lấy danh sách tất cả người dùng
- **GET /api/users/:id** - Lấy thông tin người dùng theo ID
- **POST /api/users** - Tạo người dùng mới
- **PUT /api/users/:id** - Cập nhật thông tin người dùng
- **DELETE /api/users/:id** - Xóa người dùng

### Quản lý trạm
- **GET /api/stations** - Lấy danh sách tất cả trạm
- **GET /api/stations/:id** - Lấy thông tin trạm theo ID
- **POST /api/stations** - Tạo trạm mới
- **PUT /api/stations/:id** - Cập nhật thông tin trạm
- **DELETE /api/stations/:id** - Xóa trạm

### Quản lý Rover
- **GET /api/rovers** - Lấy danh sách tất cả rover
- **GET /api/rovers/:id** - Lấy thông tin rover theo ID
- **POST /api/rovers** - Tạo rover mới
- **PUT /api/rovers/:id** - Cập nhật thông tin rover
- **DELETE /api/rovers/:id** - Xóa rover
- **POST /api/rovers/:id/reset-password** - Đặt lại mật khẩu rover

## Ví dụ Request và Response

### Lấy danh sách trạm

**Request:**
```http
GET /api/stations HTTP/1.1
Host: localhost:3000
Authorization: Basic YWRtaW46YWRtaW4xMjM=
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "HANOI_VRS",
      "description": "Hanoi VRS Mount Point",
      "lat": 21.0362,
      "lon": 105.7905,
      "status": "active"
    }
  ]
}
```

### Tạo rover mới

**Request:**
```http
POST /api/rovers HTTP/1.1
Host: localhost:3000
Authorization: Basic YWRtaW46YWRtaW4xMjM=
Content-Type: application/json

{
  "username": "newrover",
  "password": "pass123",
  "station_id": 1,
  "description": "Rover mới"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "username": "newrover",
    "station_id": 1,
    "user_id": 1,
    "status": "active",
    "description": "Rover mới"
  },
  "message": "Rover created successfully"
}
```

## Lưu ý bảo mật
Trong môi trường sản xuất, bạn nên:
1. Sử dụng HTTPS để mã hóa thông tin xác thực
2. Lưu trữ thông tin xác thực trong biến môi trường thay vì hardcode
3. Sử dụng một cơ chế phức tạp hơn nếu cần nhiều mức phân quyền khác nhau
