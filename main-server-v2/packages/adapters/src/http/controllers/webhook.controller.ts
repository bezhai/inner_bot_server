import { 
  Controller, 
  Post, 
  Body, 
  Headers, 
  HttpCode, 
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { LarkEventDto } from '../dto/lark-event.dto';
import { ProcessMessageUseCase } from '@main-server-v2/core';

@ApiTags('Webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly processMessageUseCase: ProcessMessageUseCase,
  ) {}

  @Post('lark/event')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Lark webhook events' })
  @ApiHeader({
    name: 'X-Lark-Signature',
    description: 'Lark signature for webhook verification',
    required: false,
  })
  async handleLarkEvent(
    @Body() eventData: LarkEventDto,
    @Headers('x-lark-signature') signature?: string,
  ) {
    this.logger.debug('Received Lark event', { eventData });

    // Handle URL verification
    if (eventData.type === 'url_verification') {
      return { challenge: eventData.challenge };
    }

    // Verify signature if provided
    if (signature && !this.verifySignature(eventData, signature)) {
      throw new BadRequestException('Invalid signature');
    }

    // Handle different event types
    if (eventData.header?.event_type === 'im.message.receive_v1') {
      await this.handleMessageEvent(eventData);
    }

    return { success: true };
  }

  private async handleMessageEvent(eventData: LarkEventDto) {
    const event = eventData.event;
    const message = event.message;

    try {
      const result = await this.processMessageUseCase.execute({
        messageId: message.message_id,
        chatId: message.chat_id,
        senderId: event.sender.sender_id.union_id,
        senderOpenId: event.sender.sender_id.open_id,
        content: message.content,
        messageType: message.message_type,
        createTime: message.create_time,
        rootId: message.root_id,
        parentMessageId: message.parent_id,
        mentions: message.mentions?.map((m: any) => m.id.union_id) || [],
      });

      if (!result.success) {
        this.logger.error('Failed to process message', { 
          messageId: message.message_id,
          error: result.error,
        });
      }
    } catch (error) {
      this.logger.error('Error processing message event', error);
      // Don't throw - we don't want to return error to Lark
    }
  }

  private verifySignature(eventData: any, signature: string): boolean {
    // TODO: Implement Lark signature verification
    // For now, return true in development
    if (this.configService.get<string>('app.env') === 'development') {
      return true;
    }
    
    // In production, implement proper signature verification
    const verificationToken = this.configService.get<string>('lark.verificationToken');
    const encryptKey = this.configService.get<string>('lark.encryptKey');
    
    // Implement verification logic here
    return true;
  }
}