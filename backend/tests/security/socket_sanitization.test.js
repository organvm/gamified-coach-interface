const { sequelize } = require('../../config/database');

// Mock Sequelize and Database
jest.mock('../../config/database', () => {
  const mSequelize = {
    authenticate: jest.fn().mockResolvedValue(true),
    sync: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(true),
    define: jest.fn(() => ({
      belongsToMany: jest.fn(),
      hasMany: jest.fn(),
      belongsTo: jest.fn(),
      prototype: {},
    })),
  };
  return { sequelize: mSequelize };
});

// Mock Socket.IO
let connectionHandler;
const mockSocketIo = jest.fn().mockImplementation(() => {
    return {
        use: jest.fn(),
        on: jest.fn((event, handler) => {
            if (event === 'connection') {
                connectionHandler = handler;
            }
        }),
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
    };
});

jest.mock('socket.io', () => mockSocketIo);

// Import server
const { app, io, server } = require('../../server');

describe('Socket Security: Input Sanitization (XSS)', () => {
  let mockSocket;
  let sendMessageHandler;
  let guildMessageHandler;

  beforeAll(() => {
    expect(connectionHandler).toBeDefined();
  });

  afterAll(async () => {
    if (server && server.listening) {
      server.close();
    }
  });

  beforeEach(() => {
    // Create a mock socket
    mockSocket = {
      id: 'socket-XSS',
      join: jest.fn(),
      on: jest.fn((event, handler) => {
        if (event === 'send_message') {
          sendMessageHandler = handler;
        }
        if (event === 'guild_message') {
          guildMessageHandler = handler;
        }
      }),
      emit: jest.fn(),
      user: {
        id: 'attacker-123',
        username: 'Attacker',
        guilds: [666]
      }
    };

    // Simulate connection
    connectionHandler(mockSocket);

    // Clear global io mocks
    io.to.mockClear();
    io.emit.mockClear();
  });

  it('send_message should sanitize HTML content', async () => {
    const maliciousPayload = '<script>alert("XSS")</script>';
    const expectedSanitized = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;';

    const data = {
      recipientId: 'victim-456',
      message: maliciousPayload
    };

    await sendMessageHandler(data);

    // Verify message was emitted
    expect(io.to).toHaveBeenCalledWith('user:victim-456');

    // Check the payload passed to emit
    // Note: Before the fix, this will fail if we expect sanitized output.
    // For now, let's verify what happens currently (reproduction).
    const emitCall = io.emit.mock.calls[0];
    const emittedData = emitCall[1];

    // We expect it to match the sanitized version after our fix.
    // But currently, it will match the raw payload.
    // To confirm it is vulnerable, we could assert it IS equal to maliciousPayload.
    // However, for the purpose of the plan, I will write the assertion for the FIX,
    // and expect it to fail initially.
    expect(emittedData.message).toBe(expectedSanitized);
  });

  it('guild_message should sanitize HTML content', async () => {
    const maliciousPayload = '<img src=x onerror=alert(1)>';
    const expectedSanitized = '&lt;img src=x onerror=alert(1)&gt;';

    const data = {
        guildId: 666,
        message: maliciousPayload
    };

    await guildMessageHandler(data);

    expect(io.to).toHaveBeenCalledWith('guild:666');

    const emitCall = io.emit.mock.calls[0];
    const emittedData = emitCall[1];

    expect(emittedData.message).toBe(expectedSanitized);
  });
});
