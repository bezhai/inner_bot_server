import {
  MongoClient,
  Collection,
  Filter,
  InsertOneOptions,
  UpdateOptions,
  DeleteOptions,
  CountDocumentsOptions,
  FindOptions,
  Document,
  WithId,
  OptionalUnlessRequiredId,
  MatchKeysAndValues,
} from "mongodb";

export class MongoCollection<T extends Document> {
  private collection: Collection<T>;

  constructor(collection: Collection<T>) {
    this.collection = collection;
  }

  async findOne(
    filter: Filter<T>,
    options?: FindOptions<T>
  ): Promise<T | null> {
    return this.collection.findOne(filter, options);
  }

  async find(
    filter: Filter<T>,
    options?: FindOptions<T>
  ): Promise<WithId<T>[]> {
    const cursor = this.collection.find(filter, options);
    return cursor.toArray(); // MongoDB 返回的文档包含 _id
  }

  async insertOne(
    doc: OptionalUnlessRequiredId<T>,
    options?: InsertOneOptions
  ): Promise<void> {
    await this.collection.insertOne(doc, options);
  }

  async insertMany(
    docs: OptionalUnlessRequiredId<T>[],
    options?: InsertOneOptions
  ): Promise<void> {
    await this.collection.insertMany(docs, options);
  }

  async updateOne(
    filter: Filter<T>,
    update: Partial<T>,
    options?: UpdateOptions
  ): Promise<void> {
    await this.collection.updateOne(filter, { $set: update }, options);
  }

  async updateMany(
    filter: Filter<T>,
    update: MatchKeysAndValues<T>,
    options?: UpdateOptions
  ): Promise<void> {
    await this.collection.updateMany(filter, { $set: update }, options);
  }

  async deleteMany(filter: Filter<T>, options?: DeleteOptions): Promise<void> {
    await this.collection.deleteMany(filter, options);
  }

  async countDocuments(
    filter: Filter<T>,
    options?: CountDocumentsOptions
  ): Promise<number> {
    return this.collection.countDocuments(filter, options);
  }
}
