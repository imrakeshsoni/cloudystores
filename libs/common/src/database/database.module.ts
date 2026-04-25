import { Module, DynamicModule, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export const createDatabaseConfig = (
  extraEntities: Function[] = [],
  databaseUrl = process.env.DATABASE_URL,
  nodeEnv = process.env.NODE_ENV,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: databaseUrl,
  entities: [__dirname + '/../**/*.entity{.ts,.js}', ...extraEntities],
  migrations: [__dirname + '/../../../../tools/migrations/**/*.{ts,js}'],
  synchronize: false,
  logging: nodeEnv === 'development',
  ssl: nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
  extra: {
    max: 20,
    idleTimeoutMillis: 30000,
  },
});

const TENANT_SCOPED_TABLES = [
  'shops',
  'profiles',
  'roles',
  'users',
  'categories',
  'products',
  'inventory',
  'stock_movements',
  'customers',
  'suppliers',
  'purchase_orders',
  'purchase_order_items',
  'orders',
  'order_items',
  'payments',
  'custom_field_definitions',
  'bill_sequences',
] as const;

@Injectable()
class DatabasePolicyBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DatabasePolicyBootstrapService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTenantRlsPolicies();
  }

  private async ensureTenantRlsPolicies(): Promise<void> {
    for (const table of TENANT_SCOPED_TABLES) {
      const policyName = `tenant_isolation_${table}`;

      await this.dataSource.query(
        `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = '${table}'
              AND policyname = '${policyName}'
          ) THEN
            EXECUTE 'CREATE POLICY ${policyName} ON public.${table}
              FOR ALL
              USING (tenant_id = NULLIF(current_setting(''''app.current_tenant_id'''', true), '''')::uuid)
              WITH CHECK (tenant_id = NULLIF(current_setting(''''app.current_tenant_id'''', true), '''')::uuid)';
          END IF;
        END
        $$;
        `,
      );
    }

    this.logger.log('Tenant RLS policy bootstrap completed');
  }
}

@Module({})
export class DatabaseModule {
  static forRoot(extraEntities: Function[] = []): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        ConfigModule,
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) =>
            createDatabaseConfig(
              extraEntities,
              configService.get<string>('DATABASE_URL'),
              configService.get<string>('NODE_ENV'),
            ),
        }),
      ],
      providers: [DatabasePolicyBootstrapService],
      exports: [TypeOrmModule],
    };
  }
}
