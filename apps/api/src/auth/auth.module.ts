import { Module } from '@nestjs/common';
import { AdminUsersRepository } from '../admin-users/admin-users.repository';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { SessionsRepository } from './sessions.repository';

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [AuthService, SessionService, SessionsRepository, AdminUsersRepository],
  exports: [AuthService, SessionService, SessionsRepository, AdminUsersRepository],
})
export class AuthModule {}
