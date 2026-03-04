import { NextRequest, NextResponse } from 'next/server'
import { assessRobot } from '../../../lib/maintenance'
import { RobotSnapshot } from '../../../types/robot'

interface AssessRequestBody {
  robotId: string
  snapshot: RobotSnapshot
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AssessRequestBody

    if (!body?.robotId || !body?.snapshot) {
      return NextResponse.json(
        { error: 'robotId and snapshot are required' },
        { status: 400 },
      )
    }

    const assessment = assessRobot(body.robotId, body.snapshot)
    return NextResponse.json(assessment, { status: 200 })
  } catch (error) {
    console.error('Error handling /api/assess request', error)
    return NextResponse.json(
      { error: 'Invalid request body or unexpected error' },
      { status: 400 },
    )
  }
}

