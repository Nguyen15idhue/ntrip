'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stations', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Mount point name'
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      lat: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: false
      },
      lon: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: false
      },
      location_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'locations', // Tên bảng mà nó tham chiếu đến
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT' // Không cho xóa location nếu còn station tham chiếu đến nó
      },
      source_host: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'NTRIP source caster hostname'
      },
      source_port: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 2101,
        comment: 'NTRIP source caster port'
      },
      source_user: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Username for source caster auth'
      },
      source_pass: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Password for source caster auth'
      },
      source_mount_point: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Source caster mountpoint name'
      },
      carrier: {
        type: Sequelize.STRING(10),
        allowNull: true,
        defaultValue: '2',
        comment: 'Carrier phase (1=L1, 2=L1+L2)'
      },
      nav_system: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'GPS+GLO+GAL+BDS',
        comment: 'Navigation system'
      },
      network: {
        type: Sequelize.STRING(10),
        allowNull: true,
        defaultValue: 'VRS',
        comment: 'Network type (VRS, RTK, etc.)'
      },
      country: {
        type: Sequelize.STRING(3),
        allowNull: true,
        defaultValue: 'VNM',
        comment: 'Country code (ISO 3166)'
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'inactive'
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
    await queryInterface.dropTable('stations');
  }
};