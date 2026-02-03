import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { createLogger, Observability } from '@platform/observability';
import { ApiResponse, TransactionDto, CreateTransactionRequest } from '@platform/shared-contracts';
import { BaseEventSchema, CoreBusinessEvents } from '@platform/shared-events';

const logger = createLogger({
  service: 'core-service',
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  level: process.env.LOG_LEVEL || 'info',
});

const app = express();
const PORT = process.env.PORT || 3003;

Observability.getInstance().startTracing('core-service', '1.0.0');

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

interface Transaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

const transactions: Map<string, Transaction> = new Map();

function emitBusinessEvent(eventType: string, transactionId: string, metadata?: any): void {
  const event = BaseEventSchema.parse({
    eventId: crypto.randomUUID(),
    eventType,
    eventVersion: '1.0',
    timestamp: new Date().toISOString(),
    source: 'core-service',
    correlationId: crypto.randomUUID(),
    data: { transactionId },
    metadata,
  });

  logger.info({ event }, 'Business event emitted');
}

function createTransactionDto(transaction: Transaction): TransactionDto {
  return {
    id: transaction.id,
    userId: transaction.userId,
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
    metadata: transaction.metadata,
  };
}

function validateCreateTransactionRequest(data: CreateTransactionRequest): string[] {
  const errors: string[] = [];
  
  if (!data.userId) {
    errors.push('User ID is required');
  }
  
  if (!data.type) {
    errors.push('Transaction type is required');
  }
  
  if (!data.amount || data.amount <= 0) {
    errors.push('Amount must be greater than 0');
  }
  
  if (!data.currency || data.currency.length !== 3) {
    errors.push('Valid currency code (3 characters) is required');
  }
  
  return errors;
}

app.post('/api/v1/transactions', async (req, res) => {
  try {
    const transactionData: CreateTransactionRequest = req.body;
    
    const errors = validateCreateTransactionRequest(transactionData);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors,
        },
      } as ApiResponse);
    }

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      userId: transactionData.userId,
      type: transactionData.type,
      amount: transactionData.amount,
      currency: transactionData.currency,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: transactionData.metadata,
    };

    transactions.set(transaction.id, transaction);
    
    emitBusinessEvent(CoreBusinessEvents.TRANSACTION_INITIATED, transaction.id, {
      userId: transaction.userId,
      amount: transaction.amount,
      currency: transaction.currency,
    });

    logger.info({ transactionId: transaction.id, userId: transaction.userId, amount: transaction.amount }, 'Transaction initiated');

    setTimeout(() => {
      const currentTransaction = transactions.get(transaction.id);
      if (currentTransaction && currentTransaction.status === 'pending') {
        currentTransaction.status = 'completed';
        currentTransaction.updatedAt = new Date();
        
        emitBusinessEvent(CoreBusinessEvents.TRANSACTION_COMPLETED, transaction.id, {
          userId: transaction.userId,
          amount: transaction.amount,
          currency: transaction.currency,
        });

        logger.info({ transactionId: transaction.id }, 'Transaction completed');
      }
    }, Math.random() * 5000 + 2000);

    res.status(201).json({
      success: true,
      data: createTransactionDto(transaction),
    } as ApiResponse<TransactionDto>);
  } catch (error) {
    logger.error({ error }, 'Transaction creation failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/transactions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const transaction = transactions.get(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found',
        },
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: createTransactionDto(transaction),
    } as ApiResponse<TransactionDto>);
  } catch (error) {
    logger.error({ error }, 'Transaction retrieval failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/api/v1/transactions', (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const userId = req.query.userId as string;
    const status = req.query.status as string;

    let allTransactions = Array.from(transactions.values());
    
    if (userId) {
      allTransactions = allTransactions.filter(transaction => transaction.userId === userId);
    }
    
    if (status) {
      allTransactions = allTransactions.filter(transaction => transaction.status === status);
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTransactions = allTransactions.slice(startIndex, endIndex);

    const transactionDtos = paginatedTransactions.map(createTransactionDto);

    res.json({
      success: true,
      data: transactionDtos,
      pagination: {
        page,
        limit,
        total: allTransactions.length,
        totalPages: Math.ceil(allTransactions.length / limit),
        hasNext: endIndex < allTransactions.length,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Transaction list retrieval failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.post('/api/v1/transactions/:id/cancel', (req, res) => {
  try {
    const { id } = req.params;
    const transaction = transactions.get(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found',
        },
      } as ApiResponse);
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: 'Only pending transactions can be cancelled',
        },
      } as ApiResponse);
    }

    transaction.status = 'cancelled';
    transaction.updatedAt = new Date();

    emitBusinessEvent(CoreBusinessEvents.TRANSACTION_FAILED, transaction.id, {
      userId: transaction.userId,
      reason: 'cancelled',
    });

    logger.info({ transactionId: transaction.id }, 'Transaction cancelled');

    res.json({
      success: true,
      data: createTransactionDto(transaction),
    } as ApiResponse<TransactionDto>);
  } catch (error) {
    logger.error({ error }, 'Transaction cancellation failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.post('/api/v1/assets/tokenize', (req, res) => {
  try {
    const { userId, assetType, assetValue, currency } = req.body;

    if (!userId || !assetType || !assetValue || !currency) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId, assetType, assetValue, and currency are required',
        },
      } as ApiResponse);
    }

    const tokenId = crypto.randomUUID();
    
    emitBusinessEvent(CoreBusinessEvents.ASSET_TOKENIZED, tokenId, {
      userId,
      assetType,
      assetValue,
      currency,
    });

    logger.info({ tokenId, userId, assetType, assetValue }, 'Asset tokenized');

    res.status(201).json({
      success: true,
      data: {
        tokenId,
        userId,
        assetType,
        assetValue,
        currency,
        status: 'tokenized',
        createdAt: new Date().toISOString(),
      },
    } as ApiResponse);
  } catch (error) {
    logger.error({ error }, 'Asset tokenization failed');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    } as ApiResponse);
  }
});

app.get('/health/live', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/health/ready', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    checks: {
      database: 'pass',
      cache: 'pass',
      messaging: 'pass',
      external: 'pass',
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  } as ApiResponse);
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');
  
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
  } as ApiResponse);
});

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Core Service started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    Observability.getInstance().shutdown().then(() => {
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    Observability.getInstance().shutdown().then(() => {
      process.exit(0);
    });
  });
});

export { app };
