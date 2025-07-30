'use strict';
import bcrypt from 'bcrypt';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    const hashedPassword = await bcrypt.hash('admin123', 10);

    await queryInterface.bulkInsert('users', [{
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      password_hash: hashedPassword,
      created_at: new Date(),
      updated_at: new Date()
    }], {});
  },

  async down (queryInterface, Sequelize) {
    // Xóa user dựa trên email để đảm bảo chỉ xóa đúng user admin
    await queryInterface.bulkDelete('users', { email: 'admin@example.com' }, {});
  }
};