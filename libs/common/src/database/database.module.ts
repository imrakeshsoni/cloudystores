import { Module, DynamicModule, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export const createDatabaseConfig = (
  extraEntities: Function[] = [],
  databaseUrl = process.env.DATABASE_URL,
  nodeEnv = process.env.NODE_ENV,
): TypeOrmModuleOptions => {
  const rawUrl = databaseUrl ?? '';
  const injectedPassword = process.env.DB_PASSWORD;

  // When DB_PASSWORD is injected (e.g. Cloud Run secret), parse URL components
  // manually so we avoid URL-encoding issues and the pg "Invalid URL" empty-host bug.
  if (injectedPassword !== undefined) {
    // Extract ?host= param (Cloud SQL Auth Proxy socket path)
    const hostParam = rawUrl.match(/[?&]host=([^&]+)/)?.[1];
    const socketPath = hostParam ? decodeURIComponent(hostParam) : undefined;

    // Extract username: postgresql://user:...@...
    const username = rawUrl.match(/postgresql?:\/\/([^:@/]+)/)?.[1] ?? 'shoposphere';

    // Extract database name: last path segment before ?
    const database = rawUrl.match(/\/([^/?]+)(?:\?|$)/)?.[1] ?? 'shoposphere';

    return {
      type: 'postgres',
      host: socketPath ?? 'localhost',
      username,
      password: injectedPassword,
      database,
      entities: [__dirname + '/../**/*.entity{.ts,.js}', ...extraEntities],
      migrations: [__dirname + '/../../../../tools/migrations/**/*.{ts,js}'],
      synchronize: false,
      logging: nodeEnv === 'development',
      ssl: false, // Unix sockets and Cloud SQL proxy don't support SSL negotiation
      extra: {
        max: 20,
        idleTimeoutMillis: 30000,
      },
    };
  }

  // Local dev: use DATABASE_URL as-is
  return {
    type: 'postgres',
    url: rawUrl,
    entities: [__dirname + '/../**/*.entity{.ts,.js}', ...extraEntities],
    migrations: [__dirname + '/../../../../tools/migrations/**/*.{ts,js}'],
    synchronize: false,
    logging: nodeEnv === 'development',
    ssl: process.env.DB_SSL === 'false' ? false : (nodeEnv === 'production' ? { rejectUnauthorized: false } : false),
    extra: {
      max: 20,
      idleTimeoutMillis: 30000,
    },
  };
};

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
    try {
      await this.ensureTenantRlsPolicies();
    } catch (err: unknown) {
      // Non-fatal: tables may not exist yet (migrations pending). App can still start.
      this.logger.warn(`RLS bootstrap skipped: ${(err as Error).message}`);
    }
  }

  private async ensureTenantRlsPolicies(): Promise<void> {
    for (const table of TENANT_SCOPED_TABLES) {
      const policyName = `tenant_isolation_${table}`;

      // Use $pol$ dollar-quoting for the EXECUTE argument to avoid manual quote escaping
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
            EXECUTE $pol$CREATE POLICY ${policyName} ON public.${table}
              FOR ALL
              USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
              WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)$pol$;
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
