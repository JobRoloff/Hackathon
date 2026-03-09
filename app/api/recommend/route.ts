import { NextRequest, NextResponse } from 'next/server'
import { recommendActionSteps } from '../../../lib/gpt'
import type { Anomaly, RobotSnapshot } from '../../../types/robot'

type RecommendBody =
  | Anomaly
  | { anomaly: Anomaly; snapshot?: RobotSnapshot }

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RecommendBody
    const anomaly = 'anomaly' in body && body.anomaly ? body.anomaly : (body as Anomaly)
    const snapshot = 'anomaly' in body && body.snapshot ? body.snapshot : undefined

    if (!anomaly?.id || !anomaly?.message) {
      return NextResponse.json(
        { error: 'Valid anomaly (id, message, etc.) is required' },
        { status: 400 },
      )
    }

    const recommendation = await recommendActionSteps(anomaly, { snapshot })
    if (!recommendation) {
      return NextResponse.json(
        { error: 'Could not get recommendation. Check OPENAI_API_KEY.' },
        { status: 502 },
      )
    }

    const parts: string[] = []
    if (recommendation.summary) {
      parts.push(recommendation.summary)
    }
    if (recommendation.steps.length > 0) {
      parts.push(
        recommendation.steps
          .map((s, i) => `${i + 1}. ${s}`)
          .join('\n'),
      )
    }
    const content =
      parts.length > 0
        ? parts.join('\n\n')
        : 'No specific steps returned. Review the anomaly and schedule inspection if needed.'

    return NextResponse.json({ content }, { status: 200 })
  } catch (error) {
    console.error('Error in /api/recommend:', error)
    return NextResponse.json(
      { error: 'Invalid request or server error' },
      { status: 500 },
    )
  }
}
