import { DynamicModule } from '@nestjs/common';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
export declare const createDatabaseConfig: () => TypeOrmModuleOptions;
export declare class DatabaseModule {
    static forRoot(): DynamicModule;
}
