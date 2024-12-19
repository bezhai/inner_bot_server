import { DataSource } from 'typeorm';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST!,
  port: 5432,
  username: process.env.POSTGRES_USER!,
  password: process.env.POSTGRES_PASSWORD!,
  database: process.env.POSTGRES_DB!,
  synchronize: true,
  logging: true, // 是否启用日志
  entities: [`${__dirname}/dal/entities/*.{ts,js}`], // 实体文件路径
  migrations: [`${__dirname}/migrations/*.{ts,js}`], // （可选）迁移文件路径
  subscribers: [`${__dirname}/subscribers/*.{ts,js}`], // （可选）订阅器路径
});

export default AppDataSource;