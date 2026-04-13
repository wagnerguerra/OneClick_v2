import { Module } from '@nestjs/common'
import { OnboardingService } from './onboarding.service'
import { StripeModule } from '../stripe/stripe.module'

@Module({
  imports: [StripeModule],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
