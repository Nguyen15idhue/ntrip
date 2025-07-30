'use strict';
import bcrypt from 'bcrypt';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    const hashedPassword = await bcrypt.hash('rover123', 10);
    
    // Tìm ID của user 'admin' và station 'HANOI_VRS'
    const users = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1;`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const stations = await queryInterface.sequelize.query(
      `SELECT id FROM stations WHERE name = 'HANOI_VRS' LIMIT 1;`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    // Nếu không tìm thấy user hoặc station, không làm gì cả để tránh lỗi
    if (!users || users.length === 0 || !stations || stations.length === 0) {
      console.log("Seeder 'sample-rovers': Could not find admin user or HANOI_VRS station. Skipping.");
      return;
    }

    const adminUserId = users[0].id;
    const hanoiStationId = stations[0].id;

    await queryInterface.bulkInsert('rovers', [{
      username: 'rover1',
      password_hash: hashedPassword,
      station_id: hanoiStationId,
      user_id: adminUserId,
      status: 'active',
      description: 'Demo Rover',
      last_connection: null,
      start_date: null,
      end_date: null,
      created_at: new Date(),
      updated_at: new Date()
    }], {});
  },

  async down (queryInterface, Sequelize) {
    // Xóa rover dựa trên username để đảm bảo chỉ xóa đúng rover mẫu
    await queryInterface.bulkDelete('rovers', { username: 'rover1' }, {});
  }
};