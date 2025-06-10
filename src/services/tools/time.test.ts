/**
 * Test script for the getCurrentTime tool
 *
 * To run this test:
 * npx ts-node src/services/tools/test-time.ts
 */

import { getCurrentTime } from './time';

// Test different timezones and formats
async function testGetCurrentTime() {
  console.log('=== TESTING getCurrentTime TOOL ===\n');

  // Test 1: Default timezone (Asia/Seoul) and format (full)
  console.log('Test 1: Default timezone and format');
  const test1 = getCurrentTime();
  console.log('Result:', test1);
  console.log('Display Value:', test1.displayValue);
  console.log('\n');

  // Test 2: Different timezone (America/New_York)
  console.log('Test 2: New York timezone with full format');
  const test2 = getCurrentTime('America/New_York');
  console.log('Result:', test2);
  console.log('Display Value:', test2.displayValue);
  console.log('\n');

  // Test 3: Date only format
  console.log('Test 3: Date only format');
  const test3 = getCurrentTime('Asia/Seoul', 'date');
  console.log('Result:', test3);
  console.log('Display Value:', test3.displayValue);
  console.log('\n');

  // Test 4: Time only format
  console.log('Test 4: Time only format');
  const test4 = getCurrentTime('Europe/London', 'time');
  console.log('Result:', test4);
  console.log('Display Value:', test4.displayValue);
  console.log('\n');

  // Test 5: Invalid timezone (should default to Asia/Seoul)
  console.log('Test 5: Invalid timezone');
  const test5 = getCurrentTime('Invalid/Timezone');
  console.log('Result:', test5);
  console.log('Display Value:', test5.displayValue);
  console.log('\n');

  // Test 6: UTC timezone
  console.log('Test 6: UTC timezone');
  const test6 = getCurrentTime('UTC');
  console.log('Result:', test6);
  console.log('Display Value:', test6.displayValue);
  console.log('\n');

  console.log('=== TEST COMPLETED ===');
}

// Run the tests
testGetCurrentTime().catch(error => {
  console.error('Test failed:', error);
});
