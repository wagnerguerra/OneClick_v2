import { Controller, Post, Req, Res, HttpStatus, RawBodyRequest } from '@nestjs/common'
import { StripeService } from './stripe.service'

@Controller('api/stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('webhook')
  async handleWebhook(@Req() req: RawBodyRequest<{ headers: Record<string, string | string[] | undefined> }>, @Res() res: { status: (code: number) => { json: (body: unknown) => void } }) {
    const signature = req.headers['stripe-signature']
    if (!signature) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Missing stripe-signature header' })
    }

    const rawBody = req.rawBody
    if (!rawBody) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Missing raw body' })
    }

    try {
      await this.stripeService.handleWebhookEvent(rawBody, signature as string)
      return res.status(HttpStatus.OK).json({ received: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[Stripe Webhook] Erro:', message)
      return res.status(HttpStatus.BAD_REQUEST).json({ error: message })
    }
  }
}
