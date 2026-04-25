import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Customer } from './customer.entity';
import { paginatedResponse, parsePagination } from '@shoposphere/common';
import { UpdateCustomerDto } from './dto/customer.dto';

export interface CreateCustomerDto {
  name?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
    private readonly dataSource: DataSource,
  ) {}

  async findOrCreate(tenantId: string, phone: string, name?: string): Promise<Customer> {
    let customer = await this.repo.findOne({ where: { tenantId, phone } });
    if (!customer) {
      customer = this.repo.create({ tenantId, phone, name: name ?? 'Walk-in Customer' });
      await this.repo.save(customer);
    }
    return customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto): Promise<Customer> {
    const customer = this.repo.create({ ...dto, tenantId });
    return this.repo.save(customer);
  }

  async findAll(tenantId: string, query: { page?: number; perPage?: number; search?: string }) {
    const { skip, take, page, perPage } = parsePagination(query);
    const qb = this.repo.createQueryBuilder('c').where('c.tenant_id = :tenantId', { tenantId });

    if (query.search) {
      qb.andWhere(
        '(c.name ILIKE :s OR c.phone LIKE :s OR c.email ILIKE :s OR c.id::text ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    const [data, total] = await qb.orderBy('c.name', 'ASC').skip(skip).take(take).getManyAndCount();
    return paginatedResponse(data, total, page, perPage);
  }

  async findOne(tenantId: string, id: string): Promise<any> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Customer not found');

    const orders = await this.dataSource.query(
      `SELECT id, bill_number, total, payment_status, created_at
       FROM orders
       WHERE tenant_id = $1 AND customer_id = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [tenantId, id],
    );

    const ledger = await this.dataSource.query(
      `SELECT
         o.id,
         o.bill_number,
         o.type,
         o.payment_status,
         o.total,
         o.created_at,
         CASE
           WHEN o.type = 'return' THEN 'credit'
           WHEN o.payment_status = 'pending' THEN 'debit'
           ELSE 'settled'
         END AS entry_type
       FROM orders o
       WHERE o.tenant_id = $1
         AND o.customer_id = $2
       ORDER BY o.created_at DESC
       LIMIT 100`,
      [tenantId, id],
    );

    const aging = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(CASE WHEN age_days <= 30 THEN outstanding ELSE 0 END), 0) AS current,
         COALESCE(SUM(CASE WHEN age_days BETWEEN 31 AND 60 THEN outstanding ELSE 0 END), 0) AS bucket_31_60,
         COALESCE(SUM(CASE WHEN age_days BETWEEN 61 AND 90 THEN outstanding ELSE 0 END), 0) AS bucket_61_90,
         COALESCE(SUM(CASE WHEN age_days > 90 THEN outstanding ELSE 0 END), 0) AS bucket_90_plus
       FROM (
         SELECT
           GREATEST(0, o.total) AS outstanding,
           EXTRACT(DAY FROM NOW() - o.created_at)::int AS age_days
         FROM orders o
         WHERE o.tenant_id = $1
           AND o.customer_id = $2
           AND o.payment_status = 'pending'
           AND o.status = 'confirmed'
       ) aged`,
      [tenantId, id],
    );

    return {
      ...c,
      orders,
      ledger,
      aging: aging[0] ?? { current: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0 },
      reminderHistory: Array.isArray((c.customFields as any)?.creditReminders)
        ? (c.customFields as any).creditReminders
        : [],
    };
  }

  async update(tenantId: string, id: string, dto: Partial<UpdateCustomerDto>): Promise<Customer> {
    const c = await this.findOne(tenantId, id);
    Object.assign(c, dto);
    return this.repo.save(c);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const customer = await this.findOne(tenantId, id);
    await this.repo.remove(customer);
  }

  async addLoyaltyPoints(tenantId: string, id: string, points: number): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(Customer)
      .set({ loyaltyPoints: () => `loyalty_points + ${points}` } as any)
      .where('id = :id AND tenant_id = :tenantId', { id, tenantId })
      .execute();
  }

  async addCreditBalance(tenantId: string, id: string, amount: number): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(Customer)
      .set({ creditBalance: () => `credit_balance + ${amount}` } as any)
      .where('id = :id AND tenant_id = :tenantId', { id, tenantId })
      .execute();
  }

  async collectCreditPayment(
    tenantId: string,
    id: string,
    amount: number,
    method?: string,
    notes?: string,
  ) {
    const customer = await this.repo.findOne({ where: { tenantId, id } });
    if (!customer) throw new NotFoundException('Customer not found');

    const currentBalance = Number(customer.creditBalance ?? 0);
    if (currentBalance <= 0) {
      throw new BadRequestException('Customer has no outstanding credit balance');
    }

    const safeAmount = Math.min(Number(amount), currentBalance);
    const nextBalance = Number((currentBalance - safeAmount).toFixed(2));

    customer.creditBalance = nextBalance as any;
    customer.customFields = {
      ...(customer.customFields ?? {}),
      lastCreditCollection: {
        amount: safeAmount,
        method: method ?? 'cash',
        notes: notes ?? null,
        collectedAt: new Date().toISOString(),
      },
    };

    await this.repo.save(customer);

    return {
      customerId: customer.id,
      collectedAmount: safeAmount,
      remainingBalance: nextBalance,
      method: method ?? 'cash',
    };
  }

  async sendCreditReminder(
    tenantId: string,
    id: string,
    channel?: string,
    notes?: string,
  ) {
    const customer = await this.repo.findOne({ where: { tenantId, id } });
    if (!customer) throw new NotFoundException('Customer not found');

    const reminder = {
      sentAt: new Date().toISOString(),
      channel: channel?.trim() || 'manual',
      notes: notes?.trim() || null,
      outstanding: Number(customer.creditBalance ?? 0),
    };

    const reminders = Array.isArray((customer.customFields as any)?.creditReminders)
      ? (customer.customFields as any).creditReminders
      : [];

    customer.customFields = {
      ...(customer.customFields ?? {}),
      creditReminders: [reminder, ...reminders].slice(0, 20),
      lastCreditReminder: reminder,
    };

    await this.repo.save(customer);

    return reminder;
  }
}
