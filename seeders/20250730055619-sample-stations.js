'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    // Tìm ID của location 'Hà Nội' đã được tạo từ seeder trước
    const locations = await queryInterface.sequelize.query(
      `SELECT id, lat, lon FROM locations WHERE province_name = 'Hà Nội' LIMIT 1;`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    
    // Nếu không tìm thấy location, không làm gì cả để tránh lỗi
    if (!locations || locations.length === 0) {
      console.log("Seeder 'sample-stations': Could not find 'Hà Nội' location. Skipping.");
      return;
    }

    const hanoiLocation = locations[0];

    await queryInterface.bulkInsert('stations', [{
      name: 'HANOI_VRS',
      description: 'Hanoi VRS Mount Point',
      lat: hanoiLocation.lat,
      lon: hanoiLocation.lon,
      location_id: hanoiLocation.id,
      source_host: 'example-caster.com',
      source_port: 2101,
      source_user: 'demo',
      source_pass: 'demo',
      source_mount_point: 'VRS_DEMO',
      carrier: '2',
      nav_system: 'GPS+GLO+GAL+BDS',
      network: 'VRS',
      country: 'VNM',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    }], {});
  },

  async down (queryInterface, Sequelize) {
    // Xóa station dựa trên tên để đảm bảo chỉ xóa đúng station mẫu
    await queryInterface.bulkDelete('stations', { name: 'HANOI_VRS' }, {});
  }
};