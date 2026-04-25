import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  async sendTextMessage(to: string, body: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return this.sendMessage(to, {
      type: 'text',
      text: {
        preview_url: false,
        body,
      },
    });
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    bodyParameters: string[] = [],
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const components = bodyParameters.length > 0
      ? [
          {
            type: 'body',
            parameters: bodyParameters.map((text) => ({
              type: 'text',
              text,
            })),
          },
        ]
      : undefined;

    return this.sendMessage(to, {
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    });
  }

  async uploadMedia(
    file: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<{ success: boolean; mediaId?: string; data?: unknown; error?: string }> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v22.0';

    if (!accessToken || !phoneNumberId) {
      return {
        success: false,
        error: 'WhatsApp API is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.',
      };
    }

    try {
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('file', new Blob([file], { type: mimeType }), fileName);

      const response = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        },
      );

      const data = (await response.json()) as { id?: string; error?: { message?: string } };
      if (!response.ok || !data?.id) {
        this.logger.error(`WhatsApp media upload failed: ${JSON.stringify(data)}`);
        return {
          success: false,
          error: data?.error?.message ?? 'WhatsApp media upload failed',
          data,
        };
      }

      return {
        success: true,
        mediaId: data.id,
        data,
      };
    } catch (error: any) {
      this.logger.error(`WhatsApp media upload error: ${error?.message ?? error}`);
      return { success: false, error: error?.message ?? 'WhatsApp media upload failed' };
    }
  }

  async sendImageMessage(
    to: string,
    mediaId: string,
    caption?: string,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return this.sendMessage(to, {
      type: 'image',
      image: {
        id: mediaId,
        ...(caption ? { caption } : {}),
      },
    });
  }

  private async sendMessage(
    to: string,
    payload: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v22.0';

    if (!accessToken || !phoneNumberId) {
      return {
        success: false,
        error: 'WhatsApp API is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.',
      };
    }

    const normalizedPhone = normalizeWhatsAppPhone(to);
    if (!normalizedPhone) {
      return {
        success: false,
        error: `Invalid phone number: ${to}`,
      };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: normalizedPhone,
            ...payload,
          }),
        },
      );

      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        this.logger.error(`WhatsApp send failed for ${normalizedPhone}: ${JSON.stringify(data)}`);
        return {
          success: false,
          error: data?.error?.message ?? 'WhatsApp send failed',
          data,
        };
      }

      return { success: true, data };
    } catch (error: any) {
      this.logger.error(`WhatsApp request error for ${normalizedPhone}: ${error?.message ?? error}`);
      return { success: false, error: error?.message ?? 'WhatsApp request failed' };
    }
  }
}

function normalizeWhatsAppPhone(value: string): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}
