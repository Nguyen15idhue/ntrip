Cách sử dụng API mới
Bạn có thể gửi một request POST đến /api/stations/bulk-action với body như sau:
Ví dụ 1: Bắt đầu nhiều trạm
Generated http
POST /api/stations/bulk-action
Content-Type: application/json
Authorization: Bearer <your_jwt_token>

{
  "action": "start",
  "stationIds": [1, 2, 5]
}
Use code with caution.
Http
Ví dụ 2: Dừng nhiều trạm
Generated http
POST /api/stations/bulk-action
Content-Type: application/json
Authorization: Bearer <your_jwt_token>

{
  "action": "stop",
  "stationIds": [3, 4]
}
Use code with caution.
Http
Ví dụ 3: Xóa nhiều trạm
Generated http
POST /api/stations/bulk-action
Content-Type: application/json
Authorization: Bearer <your_jwt_token>

{
  "action": "delete",
  "stationIds": [6, 7]
}
Use code with caution.
Http
Phản hồi mẫu (Response Body):
Generated json
{
    "success": true,
    "message": "Bulk action 'start' processed.",
    "results": {
        "succeeded": [1, 2],
        "failed": [
            {
                "id": 5,
                "error": "Station not found."
            }
        ]
    }
}
