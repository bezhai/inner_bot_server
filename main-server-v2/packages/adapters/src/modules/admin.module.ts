import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';

@Module({
  imports: [CoreModule],
  controllers: [],
  providers: [],
})
export class AdminModule {
  // TODO: Implement admin controllers and services
}