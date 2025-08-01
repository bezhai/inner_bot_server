// Base class for all Lark IDs
abstract class LarkId {
  protected readonly _value: string;

  constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error(`${this.constructor.name} cannot be empty`);
    }
    this._value = value.trim();
  }

  get value(): string {
    return this._value;
  }

  equals(other: LarkId): boolean {
    return this._value === other._value && this.constructor === other.constructor;
  }

  toString(): string {
    return this._value;
  }
}

// UnionId - User's unique identifier across Lark
export class UnionId extends LarkId {
  constructor(value: string) {
    super(value);
    if (!this.isValid(value)) {
      throw new Error('Invalid UnionId format');
    }
  }

  private isValid(value: string): boolean {
    // UnionId format: on_xxx or ou_xxx
    return /^(on_|ou_)[a-zA-Z0-9]+$/.test(value);
  }
}

// OpenId - User's identifier specific to an app
export class OpenId extends LarkId {
  constructor(value: string) {
    super(value);
    if (!this.isValid(value)) {
      throw new Error('Invalid OpenId format');
    }
  }

  private isValid(value: string): boolean {
    // OpenId format: ou_xxx
    return /^ou_[a-zA-Z0-9]+$/.test(value);
  }
}

// ChatId - Chat/conversation identifier
export class ChatId extends LarkId {
  constructor(value: string) {
    super(value);
    if (!this.isValid(value)) {
      throw new Error('Invalid ChatId format');
    }
  }

  private isValid(value: string): boolean {
    // ChatId format: oc_xxx
    return /^oc_[a-zA-Z0-9]+$/.test(value);
  }
}

// MessageId - Message identifier
export class MessageId extends LarkId {
  constructor(value: string) {
    super(value);
    if (!this.isValid(value)) {
      throw new Error('Invalid MessageId format');
    }
  }

  private isValid(value: string): boolean {
    // MessageId format: om_xxx
    return /^om_[a-zA-Z0-9]+$/.test(value);
  }
}

// AppId - Application identifier
export class AppId extends LarkId {
  constructor(value: string) {
    super(value);
    if (!this.isValid(value)) {
      throw new Error('Invalid AppId format');
    }
  }

  private isValid(value: string): boolean {
    // AppId format: cli_xxx
    return /^cli_[a-zA-Z0-9]+$/.test(value);
  }
}