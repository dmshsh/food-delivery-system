import { Global, Module } from '@nestjs/common';
import { SecurityService } from './security.service';

// Global: AuthGuard runs inside every feature module and has to be able to write
// "role denied" lines to the journal from any of them.
@Global()
@Module({ providers: [SecurityService], exports: [SecurityService] })
export class SecurityModule {}
