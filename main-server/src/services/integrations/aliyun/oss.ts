import OSS from 'ali-oss';

export class OssService {
  private client: OSS;
  private static instance: OssService


  constructor(config: OSS.Options) {
    this.client = new OSS(config);
  }

  static getInstance(): OssService {
    if (!OssService.instance) {
        OssService.instance = new OssService({
            endpoint: process.env.END_POINT,
            accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
            accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
            bucket: process.env.OSS_BUCKET,
            cname: true,
        });
    }
    return OssService.instance;
  }

  async uploadFile(fileName: string, file: any): Promise<OSS.PutObjectResult> {
    console.debug('Uploading file to OSS:', fileName);
    return this.client.put(fileName, file);
  }

  async getFile(fileName: string): Promise<OSS.GetObjectResult> {
    return this.client.get(fileName);
  }

  async getFileUrl(
    fileName: string,
    isForDownload: boolean = false,
  ): Promise<string> {
    const options: OSS.SignatureUrlOptions = { expires: 8 * 60 * 60 };
    const pixivAddr = fileName.split('/').pop();
    if (!pixivAddr) {
      return '';
    }
    const headerResponse = await this.client.head(fileName);
    const contentLength = Number(
      (headerResponse.res.headers as { 'content-length': string })[
        'content-length'
      ],
    );
    if (isForDownload) {
      options.response = {};
      options.response['content-disposition'] =
        `attachment; filename=${pixivAddr}`;
    } else if (contentLength < 1024 * 1024 * 20) {
      // 过大图片展示的时候无法加样式
      options.process = 'style/sort_image';
    }
    return this.client.signatureUrl(fileName, options);
  }
}

export function getOss(): OssService {
    return OssService.getInstance();
}