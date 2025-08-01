import { IsString, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class LarkEventHeader {
  @ApiProperty()
  @IsString()
  event_id: string;

  @ApiProperty()
  @IsString()
  event_type: string;

  @ApiProperty()
  @IsString()
  create_time: string;

  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty()
  @IsString()
  app_id: string;

  @ApiProperty()
  @IsString()
  tenant_key: string;
}

class LarkSenderId {
  @ApiProperty()
  @IsString()
  union_id: string;

  @ApiProperty()
  @IsString()
  user_id: string;

  @ApiProperty()
  @IsString()
  open_id: string;
}

class LarkSender {
  @ApiProperty()
  @ValidateNested()
  @Type(() => LarkSenderId)
  sender_id: LarkSenderId;

  @ApiProperty()
  @IsString()
  sender_type: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  tenant_key?: string;
}

class LarkMention {
  @ApiProperty()
  @IsString()
  key: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => LarkSenderId)
  id: LarkSenderId;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  tenant_key?: string;
}

class LarkMessage {
  @ApiProperty()
  @IsString()
  message_id: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  root_id?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  parent_id?: string;

  @ApiProperty()
  @IsString()
  create_time: string;

  @ApiProperty()
  @IsString()
  chat_id: string;

  @ApiProperty()
  @IsString()
  chat_type: string;

  @ApiProperty()
  @IsString()
  message_type: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiProperty({ type: [LarkMention] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LarkMention)
  mentions?: LarkMention[];
}

class LarkEventData {
  @ApiProperty()
  @ValidateNested()
  @Type(() => LarkSender)
  sender: LarkSender;

  @ApiProperty()
  @ValidateNested()
  @Type(() => LarkMessage)
  message: LarkMessage;
}

export class LarkEventDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  schema?: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => LarkEventHeader)
  header: LarkEventHeader;

  @ApiProperty()
  @ValidateNested()
  @Type(() => LarkEventData)
  event: LarkEventData;

  @ApiProperty({ description: 'For URL verification' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ description: 'For URL verification' })
  @IsOptional()
  @IsString()
  challenge?: string;
}