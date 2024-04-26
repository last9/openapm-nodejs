setupNext() {
  echo "Setting up Next.js"
  npx next build ./tests/nextjs
}

setupPrisma() {
  echo "Setting up Prisma"
  npx prisma generate --schema=./tests/prisma/schema.prisma
  npx prisma migrate dev --schema=./tests/prisma/schema.prisma --name init
}

# Run all tests
runAllTests() {
  setupNext
  setupPrisma
  npm run vitest
}

# Run Next.js tests
runNextJsTests() {
  setupNext
  npm run vitest -t ./tests/nextjs/nextjs.test.ts
}

# Run Prisma tests
runPrismaTests() {
  setupPrisma
  npm run vitest -t ./tests/prisma/prisma.test.ts
}

# Check if a variable is passed
if [ "$1" = "nextjs" ]; then
  # Run Next.js tests without setting up
  if [ "$2" = "--no-setup" ]; then
    npm run vitest -t ./tests/nextjs/nextjs.test.ts
  else
    runNextJsTests
  fi
elif [ "$1" = "prisma" ]; then
  runPrismaTests
else
  runAllTests
fi