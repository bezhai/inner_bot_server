import {
  CardHeader,
  Column,
  ColumnSet,
  FormComponent,
  LarkCard,
  MarkdownComponent,
  PlainText,
  SelectComponent,
  SelectOption,
  TableButtonComponent,
} from 'feishu-card';
import { Message } from '../../../../models/message';
import { getAvailableModelsForChat, getAvailablePromptsForChat, getChatAIConfig } from '../../ai/ai-config-service';
import { replyCard } from '../../../lark/basic/message';
import { SetLLMConfig } from '../../../../types/lark';

export async function setAIConfig(message: Message): Promise<void> {
  const { prompt_id, model_id, params } = await getChatAIConfig(message.chatId);

  const validModels = await getAvailableModelsForChat(message.chatId);
  const validPrompts = await getAvailablePromptsForChat(message.chatId);

  // 需要发送卡片
  const card = new LarkCard().withHeader(new CardHeader('模型配置').color('green')).addElement(
    new FormComponent('form', 'form').pushElement(
      new ColumnSet('column_set_1').addColumns(
        new Column('column_1')
          .addElements(new MarkdownComponent('text_1', '当前模型'))
          .setVerticalAlign('center')
          .setWidth('100px'),
        new Column('column_2')
          .addElements(
            new SelectComponent('select_model')
              .setPlaceholder(new PlainText('请选择模型'))
              .setName('select_model')
              .setInitialOption(model_id)
              .setOptions(
                validModels.map(
                  (model) =>
                    new SelectOption(model.name + (model.description ? `(${model.description})` : ''), model.model_id),
                ),
              ),
          )
          .setVerticalAlign('center'),
      ),
      new ColumnSet('column_set_2').addColumns(
        new Column('column_3')
          .addElements(new MarkdownComponent('text_2', '当前提示词'))
          .setVerticalAlign('center')
          .setWidth('100px'),
        new Column('column_4')
          .addElements(
            new SelectComponent('select_prompt')
              .setPlaceholder(new PlainText('请选择提示词'))
              .setName('select_prompt')
              .setInitialOption(prompt_id)
              .setOptions(validPrompts.map((prompt) => new SelectOption(prompt.name, prompt.prompt_id))),
          )
          .setVerticalAlign('center'),
      ),
      new ColumnSet('column_set_3').addColumns(
        new Column('column_5')
          .addElements(new MarkdownComponent('text_3', '联网搜索'))
          .setVerticalAlign('center')
          .setWidth('100px'),
        new Column('column_6')
          .addElements(
            new SelectComponent('enable_search')
              .setPlaceholder(new PlainText('是否开启'))
              .setName('enable_search')
              .setInitialOption(params?.extra_body?.['web-search'] ? 'true' : 'false')
              .setOptions([new SelectOption('开启', 'true'), new SelectOption('关闭', 'false')]),
          )
          .setVerticalAlign('center'),
      ),
      new TableButtonComponent('table_button', 'table_button', 'form_submit').setText('提交').addValue({
        type: SetLLMConfig,
      }),
    ),
  );

  await replyCard(message.messageId, card);
}
