'use strict';

/** @type {import('sequelize-cli').Migration} */
// Thay "module.exports =" bằng "export default"
export default {
  // Hàm 'up' sẽ được chạy khi bạn thực thi migration (tạo bảng)
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('locations', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      province_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      lat: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: false
      },
      lon: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  // Hàm 'down' sẽ được chạy khi bạn hoàn tác (rollback) migration (xóa bảng)
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('locations');
  }
};