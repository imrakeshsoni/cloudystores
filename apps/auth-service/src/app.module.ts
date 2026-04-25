import { Module, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '@shoposphere/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { User } from './users/user.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    DatabaseModule.forRoot([User]),
    ThrottlerModule.forRoot([
      {
        name: 'login',
        ttl: 60000,   // 1 minute
        limit: 5,     // 5 login attempts per minute
      },
    ]),
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
