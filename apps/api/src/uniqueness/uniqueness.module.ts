import { Global, Module } from '@nestjs/common';
import { UniquenessService } from './uniqueness.service';

// Global: registration, the profile editor and the menu editor all live in
// different modules and all need the same rules.
@Global()
@Module({ providers: [UniquenessService], exports: [UniquenessService] })
export class UniquenessModule {}
