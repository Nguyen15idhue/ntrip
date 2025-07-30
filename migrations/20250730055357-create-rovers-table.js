'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('rovers', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      username: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      password_hash: {
        type: Sequelize.STRING,
        allowNull: false
      },
            station_id: {
        type: Sequelize.INTEGER,
        allowNull: true, // THAY ĐỔI Ở ĐÂY: Cho phép NULL
        references: {
          model: 'stations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL' // Giữ nguyên hành vi này
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users', // Tên bảng mà nó tham chiếu đến
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE' // Thường thì khi user bị xóa, rover cũng nên bị xóa
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active'
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      last_connection: {
        type: Sequelize.DATE,
        allowNull: true
      },
      start_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        comment: 'The date when the rover becomes active.'
      },
      end_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        comment: 'The date when the rover expires.'
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

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('rovers');
  }
};