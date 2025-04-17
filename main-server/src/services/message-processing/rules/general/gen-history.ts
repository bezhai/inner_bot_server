import dayjs from 'dayjs';
import _ from 'lodash';
import { In } from 'typeorm';
import { CardHeader, ChartElement, LarkCard, LineChartSpec, MarkdownComponent, PieChartSpec, WordCloudChartSpec } from 'feishu-card';
import { LarkUserOpenIdRepository } from '../../../../dal/repositories/repositories';
import { Message } from '../../../../models/message';
import { buildWeeklyWordCloud } from '../../../../utils/text/jieba';
import { replyCard, searchGroupMessage } from '../../../lark/basic/message';

function splitTime(start: number, end: number, splitSize: number): number[][] {
  // 确保输入有效
  if (splitSize <= 0 || start >= end) {
    throw new Error('Invalid input: splitSize must be > 0 and start must be < end');
  }

  const step = Math.floor((end - start) / splitSize); // 每个区间的步长
  const result: number[][] = [];

  for (let i = 0; i < splitSize - 1; i++) {
    // 创建每个子区间
    result.push([start + i * step, start + (i + 1) * step - 1]);
  }

  // 添加最后一个区间，确保覆盖到 end
  result.push([start + (splitSize - 1) * step, end]);

  return result;
}

export async function genHistoryCard(message: Message) {
  const messages = await getHistoryMessage(message.chatId);
  const { messageCountMap, messagePersonMap, messageByPersonMap, repressionMap } = processMessages(messages);

  const activeChart = new ChartElement(
    'active_chart',
    new LineChartSpec(
      { text: '活跃大盘' },
      'x',
      'y',
      'series',
      {
        visible: true,
      },
      {
        visible: true,
        orient: 'bottom',
        position: 'middle',
      },
      'monotone',
    ),
  );

  const dateKeys = Object.keys(messageCountMap);
  dateKeys.sort(); // 确保日期是按顺序排列的
  dateKeys.forEach((date) => {
    activeChart.chart_spec.addLineData(date, messagePersonMap[date], '活跃人数');
    activeChart.chart_spec.addLineData(date, messageCountMap[date], '消息数');
  });

  // 接着是发言人数的图表
  const personChart = new ChartElement(
    'person_chart',
    new PieChartSpec({ text: '龙王' }, 'value', 'category', {
      visible: true,
    })
      .setPie({
        state: {
          hover: {
            outerRadius: 0.65,
            stroke: '#000',
            lineWidth: 1,
          },
          selected: {
            outerRadius: 0.65,
            stroke: '#000',
            lineWidth: 1,
          },
        },
      })
      .setInnerRadius(0.4)
      .setOuterRadius(0.6),
  );

  // 对 messageByPersonMap 进行排序，按照消息数量降序排列
  const sortedPersonMap = Object.entries(messageByPersonMap).sort((a, b) => b[1] - a[1]);
  // 取前 10 个发言最多的人
  const top10PersonMap = sortedPersonMap.slice(0, 10);

  // 这里拿到的是openId到发言数的映射, 需要增加一个openId到name的映射
  const openIdToNameMap = await openIdToName(top10PersonMap.map(([openId]) => openId));

  // 将 top10PersonMap 转换为饼图所需的数据格式, 这里是name和发言数
  const pieData = top10PersonMap.map(([category, value]) => ({
    category: openIdToNameMap[category] || category, // 优先使用 openIdToNameMap 中的 name，如果没有则使用 openId
    value,
  }));
  // 添加数据到饼图
  pieData.forEach((data) => {
    personChart.chart_spec.addPieData(data.value, data.category);
  });
  // 还需要将剩下的人合并为一个 "其他" 类别
  const otherValue = sortedPersonMap.slice(10).reduce((acc, [_, value]) => acc + value, 0);

  if (otherValue > 0) {
    personChart.chart_spec.addPieData(otherValue, '其他');
  }

  // 我们还需要一个词云, 需要先换成去除emoji后的消息
  const clearTexts = messages
    .map((message) => message.withoutEmojiText())
    .filter((text) => text.length > 0 && !text.includes('https://'));

  const wordCloudMap = await buildWeeklyWordCloud(clearTexts);

  // 对 wordCloudMap 进行排序，按照权重降序排列, 取前100个
  const sortedWordCloudMap = Object.entries(wordCloudMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100);

  // 构建词云的图表
  const wordCloudChart = new ChartElement(
    'word_cloud_chart',
    new WordCloudChartSpec({ text: '本群词云' }, 'name', 'value', 'name'),
  );

  // 添加数据到词云
  sortedWordCloudMap.forEach(([name, value]) => {
    wordCloudChart.chart_spec.addWordCloudData(name, value);
  });

  const card = new LarkCard().withHeader(new CardHeader('七天水群趋势').color('green'));
  card.addElement(activeChart, personChart, wordCloudChart);

  if (message.chatId === 'oc_a44255e98af05f1359aeb29eeb503536') {
    // 压抑群hardcode加一下压抑榜

    const repressionTitle = new MarkdownComponent('repression_title', '**压抑榜**');

    const repressionList = Object.entries(repressionMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId, count], index) => `[**压抑分**：${count}] <at id=${userId}></at> ${getRankEmoji(index)}`);

    const repressionMarkdownComponent = new MarkdownComponent('repression', repressionList.join('\n'));

    card.addElement(repressionTitle, repressionMarkdownComponent);
  }

  // 最后需要发送卡片
  replyCard(message.messageId, card);
}

function getRankEmoji(index: number) {
  switch (index) {
    case 0:
      return '🥇';
    case 1:
      return '🥈';
    case 2:
      return '🥉';
    default:
      return '';
  }
}

async function getHistoryMessage(chatId: string) {
  const startTime = dayjs().startOf('day').subtract(6, 'day').add(8, 'hour').unix(); // 这里手动调一下东八区, 这里是因为我们要取东八区的零点
  const endTime = dayjs().unix();

  // 分割时间区间
  const splitSize = 10;
  const timeIntervals = splitTime(startTime, endTime, splitSize); // 返回 [[start1, end1], [start2, end2], ...]

  const messageList: Message[] = [];
  const promises: Promise<void>[] = [];

  for (const [start, end] of timeIntervals) {
    const task = async () => {
      const messages = await searchGroupMessage(chatId, start, end);
      if (messages && messages.length > 0) {
        messageList.push(...messages);
      }
    };

    promises.push(task());
  }

  try {
    await Promise.all(promises);
    console.log('All messages fetched successfully!');
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }

  return messageList;
}

// 计算压抑分
// 文本中每出现一个“压抑”加1分
function calcRepressionScore(content: string) {
  const repressionCount = countNonOverlappingSubstring(content, '压抑');
  return repressionCount;
}

function countNonOverlappingSubstring(str: string, substring: string) {
  const regex = new RegExp(substring, 'g');
  const matches = str.match(regex);
  return matches ? matches.length : 0;
}

function processMessages(messages: Message[]) {
  // 过滤掉机器人消息
  const userMessages = messages.filter((message) => !message.isRobotMessage);

  // 按日期分组（MM-DD 格式）
  const messageGroupMap = _.groupBy(
    userMessages,
    (m) =>
      dayjs(parseInt(m.createTime ?? ''))
        .add(8, 'hour')
        .format('MM-DD'), // 转为东八区时间并格式化
  );

  const messageCountMap: Record<string, number> = {}; // 每天的消息数量
  const messagePersonMap: Record<string, number> = {}; // 每天发言人数
  const messageByPersonMap: Record<string, number> = {}; // 按人统计的消息数量
  const repressionMap: Record<string, number> = {}; // 按人统计的压抑次数

  // 遍历分组后的消息
  for (const [date, messagesByDay] of Object.entries(messageGroupMap)) {
    // 1. 消息数量统计
    messageCountMap[date] = messagesByDay.length;

    // 2. 发言人数统计（取唯一的用户 ID）
    const uniqueUserSet = new Set(messagesByDay.map((m) => m.sender));
    messagePersonMap[date] = uniqueUserSet.size;

    // 3. 按用户统计消息数量（不按天）
    for (const message of messagesByDay) {
      const userId = message.sender;
      messageByPersonMap[userId] = (messageByPersonMap[userId] || 0) + 1;

      repressionMap[userId] = (repressionMap[userId] || 0) + calcRepressionScore(message.text());
    }
  }

  return {
    messageCountMap, // 每天的消息数量
    messagePersonMap, // 每天的发言人数
    messageByPersonMap, // 按人的消息数量
    repressionMap, // 按人的压抑次数
  };
}

async function openIdToName(openIds: string[]): Promise<Record<string, string>> {
  const users = await LarkUserOpenIdRepository.find({
    where: {
      openId: In(openIds),
    },
  });

  return users.reduce(
    (acc, user) => {
      acc[user.openId] = user.name;
      return acc;
    },
    {} as Record<string, string>,
  );
}
