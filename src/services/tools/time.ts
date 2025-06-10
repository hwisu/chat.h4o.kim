/**
 * Time related tools
 */

import { secureLog, ToolResult } from './common';

/**
 * Current time tool - provides current time in various timezones and formats
 */
export function getCurrentTime(timezone?: string, format: string = 'full'): ToolResult<{
  time: string;
  date: string;
  datetime: string;
  timezone: string;
  unix_timestamp: number;
  utc_offset: string;
}> {
  try {
    // Timezone validation (whitelist approach)
    const allowedTimezones = [
      'Asia/Seoul', 'America/New_York', 'Europe/London', 'Asia/Tokyo',
      'America/Los_Angeles', 'Europe/Paris', 'Asia/Shanghai', 'UTC'
    ];

    const validTimezone = timezone && allowedTimezones.includes(timezone) ? timezone : 'Asia/Seoul';

    const now = new Date();

    // Datetime formatter
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: validTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short'
    });

    // Date only formatter
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: validTimezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    // Time only formatter
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: validTimezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // Calculate timezone offset
    const timeZoneOffset = new Date().toLocaleString('en-US', {
      timeZone: validTimezone,
      timeZoneName: 'longOffset'
    }).split(' ').pop();

    const formattedDateTime = formatter.format(now);
    const formattedDate = dateFormatter.format(now);
    const formattedTime = timeFormatter.format(now);

    const responseData = {
      time: formattedTime,
      date: formattedDate,
      datetime: formattedDateTime,
      timezone: validTimezone,
      unix_timestamp: Math.floor(now.getTime() / 1000),
      utc_offset: timeZoneOffset || ''
    };

    // Adjust response based on requested format
    let displayValue = responseData.datetime;
    if (format === 'date') {
      displayValue = responseData.date;
    } else if (format === 'time') {
      displayValue = responseData.time;
    }

    return {
      success: true,
      data: responseData,
      displayValue
    };
  } catch (error) {
    secureLog('error', 'Time retrieval failed', { error: error instanceof Error ? error.message : 'Unknown' });
    return {
      success: false,
      error: `Failed to retrieve time information: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
