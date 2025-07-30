'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    const vietnamProvinces = [
      { province_name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
      { province_name: 'Hồ Chí Minh', lat: 10.8231, lon: 106.6297 },
      { province_name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
      { province_name: 'Hải Phòng', lat: 20.8449, lon: 106.6881 },
      { province_name: 'Cần Thơ', lat: 10.0452, lon: 105.7469 },
      { province_name: 'An Giang', lat: 10.5215, lon: 105.1258 },
      { province_name: 'Bà Rịa - Vũng Tàu', lat: 10.5398, lon: 107.2376 },
      { province_name: 'Bắc Giang', lat: 21.3014, lon: 106.6292 },
      { province_name: 'Bắc Kạn', lat: 22.1477, lon: 105.8348 },
      { province_name: 'Bạc Liêu', lat: 9.2940, lon: 105.7244 },
      { province_name: 'Bắc Ninh', lat: 21.1214, lon: 106.0534 },
      { province_name: 'Bến Tre', lat: 10.2433, lon: 106.3756 },
      { province_name: 'Bình Định', lat: 13.7827, lon: 109.2196 },
      { province_name: 'Bình Dương', lat: 11.0686, lon: 106.6975 },
      { province_name: 'Bình Phước', lat: 11.7511, lon: 106.7207 },
      { province_name: 'Bình Thuận', lat: 11.0998, lon: 108.0720 },
      { province_name: 'Cà Mau', lat: 9.1527, lon: 105.1960 },
      { province_name: 'Cao Bằng', lat: 22.6667, lon: 106.2500 },
      { province_name: 'Đắk Lắk', lat: 12.6667, lon: 108.0500 },
      { province_name: 'Đắk Nông', lat: 12.0045, lon: 107.6871 },
      { province_name: 'Điện Biên', lat: 21.3856, lon: 103.0169 },
      { province_name: 'Đồng Nai', lat: 11.0686, lon: 107.1677 },
      { province_name: 'Đồng Tháp', lat: 10.4931, lon: 105.6299 },
      { province_name: 'Gia Lai', lat: 13.8080, lon: 108.1094 },
      { province_name: 'Hà Giang', lat: 22.8333, lon: 105.0000 },
      { province_name: 'Hà Nam', lat: 20.5467, lon: 105.9219 },
      { province_name: 'Hà Tĩnh', lat: 18.3333, lon: 105.9000 },
      { province_name: 'Hải Dương', lat: 20.9372, lon: 106.3145 },
      { province_name: 'Hậu Giang', lat: 9.7579, lon: 105.6413 },
      { province_name: 'Hòa Bình', lat: 20.8133, lon: 105.3383 },
      { province_name: 'Hưng Yên', lat: 20.6464, lon: 106.0511 },
      { province_name: 'Khánh Hòa', lat: 12.2585, lon: 109.1967 },
      { province_name: 'Kiên Giang', lat: 10.0215, lon: 105.1258 },
      { province_name: 'Kon Tum', lat: 14.3544, lon: 108.0093 },
      { province_name: 'Lai Châu', lat: 22.3964, lon: 103.4716 },
      { province_name: 'Lâm Đồng', lat: 11.9465, lon: 108.4419 },
      { province_name: 'Lạng Sơn', lat: 21.8530, lon: 106.7610 },
      { province_name: 'Lào Cai', lat: 22.4837, lon: 103.9734 },
      { province_name: 'Long An', lat: 10.5433, lon: 106.4131 },
      { province_name: 'Nam Định', lat: 20.4297, lon: 106.1686 },
      { province_name: 'Nghệ An', lat: 19.2345, lon: 104.9200 },
      { province_name: 'Ninh Bình', lat: 20.2581, lon: 105.9750 },
      { province_name: 'Ninh Thuận', lat: 11.5603, lon: 108.9903 },
      { province_name: 'Phú Thọ', lat: 21.3989, lon: 105.1678 },
      { province_name: 'Phú Yên', lat: 13.0881, lon: 109.0928 },
      { province_name: 'Quảng Bình', lat: 17.4633, lon: 106.6228 },
      { province_name: 'Quảng Nam', lat: 15.5394, lon: 108.0191 },
      { province_name: 'Quảng Ngãi', lat: 15.1203, lon: 108.7978 },
      { province_name: 'Quảng Ninh', lat: 21.0064, lon: 107.2925 },
      { province_name: 'Quảng Trị', lat: 16.7943, lon: 107.0451 },
      { province_name: 'Sóc Trăng', lat: 9.6037, lon: 105.9739 },
      { province_name: 'Sơn La', lat: 21.1667, lon: 104.0000 },
      { province_name: 'Tây Ninh', lat: 11.3353, lon: 106.1097 },
      { province_name: 'Thái Bình', lat: 20.4500, lon: 106.3333 },
      { province_name: 'Thái Nguyên', lat: 21.5694, lon: 105.8181 },
      { province_name: 'Thanh Hóa', lat: 19.8067, lon: 105.7667 },
      { province_name: 'Thừa Thiên Huế', lat: 16.4637, lon: 107.5908 },
      { province_name: 'Tiền Giang', lat: 10.3610, lon: 106.3594 },
      { province_name: 'Trà Vinh', lat: 9.9347, lon: 106.3453 },
      { province_name: 'Tuyên Quang', lat: 21.7767, lon: 105.2281 },
      { province_name: 'Vĩnh Long', lat: 10.2394, lon: 105.9733 },
      { province_name: 'Vĩnh Phúc', lat: 21.3608, lon: 105.5474 },
      { province_name: 'Yên Bái', lat: 21.7167, lon: 104.9000 }
    ].map(p => ({
      ...p,
      created_at: new Date(),
      updated_at: new Date()
    }));

    await queryInterface.bulkInsert('locations', vietnamProvinces, {});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('locations', null, {});
  }
};