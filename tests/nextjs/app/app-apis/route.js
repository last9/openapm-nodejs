import { NextResponse } from 'next/server';

const handler = async (req) => {
  return NextResponse.json({
    status: 200,
    body: {
      message: 'GET method called'
    }
  });
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
export const HEAD = handler;
