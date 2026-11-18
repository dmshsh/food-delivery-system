import { Global, Module } from '@nestjs/common';
import { IpGuardService, SecurityService } from './security.service';

// Global: AuthGuard runs inside every feature module and has to be able to write
// "role denied" lines to the journal from any of them.
@Global()
@Module({
  providers: [SecurityService, IpGuardService],
  exports: [SecurityService, IpGuardService],
})
export class SecurityModule {}
