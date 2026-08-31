'use client'

/**
 * Feixe de linhas em movimento — o fundo animado do hero, copiado do LuminAux.
 *
 * Medido no modelo antes de escrever: dezesseis linhas, alfa entre 7 e 110 de
 * 255 (quase todas abaixo de 50), e um feixe que CONVERGE — na borda esquerda as
 * linhas ocupam uma faixa de 113px, na direita, 43px. É essa convergência que dá
 * a sensação de profundidade; linhas paralelas viram papel de parede listrado.
 *
 * Canvas, e não SVG: são dezesseis curvas redesenhadas a cada quadro, e dezesseis
 * `<path>` mudando de `d` sessenta vezes por segundo custam layout e estilo em
 * toda atualização.
 *
 * Respeita `prefers-reduced-motion`: quem pediu menos movimento no sistema
 * recebe o desenho PARADO, não a ausência dele. O fundo continua ali, só não
 * anda — tirar tudo puniria quem pediu conforto com uma tela mais pobre.
 */

import { useEffect, useRef } from 'react'
import { cn } from '@saas/ui'

type Props = {
  /** Cor das linhas em `r, g, b` — o alfa é aplicado por linha. */
  cor?: string
  /** Multiplicador do alfa. O escuro precisa de mais para a linha se ver. */
  intensidade?: number
  className?: string
}

const LINHAS = 16
const VELOCIDADE = 0.00022

export function FeixeDeLinhas({ cor = '255, 255, 255', intensidade = 1, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const paradoPorPreferencia = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let quadro = 0
    let largura = 0
    let altura = 0

    // O canvas é redimensionado pela densidade da tela; sem isso a linha de 1px
    // vira um borrão de 2px em monitor retina.
    function dimensionar() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas!.getBoundingClientRect()
      largura = r.width
      altura = r.height
      canvas!.width = Math.round(largura * dpr)
      canvas!.height = Math.round(altura * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function desenhar(t: number) {
      ctx!.clearRect(0, 0, largura, altura)

      for (let i = 0; i < LINHAS; i++) {
        // `p` é a posição da linha dentro do feixe, de 0 (topo) a 1 (base).
        const p = i / (LINHAS - 1)
        const fase = t * VELOCIDADE + i * 0.35

        ctx!.beginPath()
        for (let x = 0; x <= largura; x += 6) {
          const fx = x / largura

          // O feixe converge: a abertura vertical encolhe da esquerda para a
          // direita, e o centro sobe. São os dois números medidos no modelo.
          const abertura = altura * (0.42 - 0.26 * fx)
          const centro = altura * (0.78 - 0.42 * fx)

          // A ondulação nasce quase nula na esquerda e cresce — assim as linhas
          // saem do mesmo lugar e se abrem, em vez de tremerem por inteiro.
          const onda = Math.sin(fx * 3.2 + fase) * altura * 0.05 * fx

          const y = centro + (p - 0.5) * abertura + onda
          if (x === 0) ctx!.moveTo(x, y)
          else ctx!.lineTo(x, y)
        }

        // Alfa por linha: as das pontas quase somem, as do meio marcam. É o que
        // impede o feixe de virar uma mancha de intensidade uniforme.
        const alfa = (0.05 + 0.14 * Math.sin(p * Math.PI)) * intensidade
        ctx!.strokeStyle = `rgba(${cor}, ${alfa.toFixed(3)})`
        ctx!.lineWidth = 1
        ctx!.stroke()
      }
    }

    function laço(t: number) {
      desenhar(t)
      quadro = requestAnimationFrame(laço)
    }

    dimensionar()
    if (paradoPorPreferencia) desenhar(0)
    else quadro = requestAnimationFrame(laço)

    const observador = new ResizeObserver(() => {
      dimensionar()
      if (paradoPorPreferencia) desenhar(0)
    })
    observador.observe(canvas)

    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [cor, intensidade])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    />
  )
}
