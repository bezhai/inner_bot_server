import dayjs from 'dayjs';

export function getCurrentDateTime() {
  const now = dayjs().add(8, 'hour'); // Convert to UTC+8
  return {
    date: now.format('YYYY年MM月DD日'),
    time: now.format('HH点mm分'),
  };
}
