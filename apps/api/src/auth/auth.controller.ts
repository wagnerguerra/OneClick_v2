import { All, Controller, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @All('*path')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    const url = new URL(
      req.originalUrl,
      `${req.protocol}://${req.get('host')}`,
    )

    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value)
      }
    }

    const webRequest = new Request(url.toString(), {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD'
        ? JSON.stringify(req.body)
        : undefined,
    })

    const response = await this.authService.handleRequest(webRequest)

    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })

    res.status(response.status)

    const body = await response.text()
    res.send(body)
  }
}
