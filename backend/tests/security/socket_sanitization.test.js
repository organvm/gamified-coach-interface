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

describe('Socket Security: Input Sanitization', () => {
  let mockSocket;
  let directMessageHandler;
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
    mockSocket = {
      id: 'socket-xss-test',
      join: jest.fn(),
      on: jest.fn((event, handler) => {
        if (event === 'send_message') {
            directMessageHandler = handler;
        } else if (event === 'guild_message') {
            guildMessageHandler = handler;
        }
      }),
      emit: jest.fn(),
      user: {
        id: 'user-hacker',
        username: 'Hacker',
        guilds: [100]
      }
    };

    // Simulate connection
    connectionHandler(mockSocket);

    // Clear mocks
    if (io.to.mockClear) io.to.mockClear();
    if (io.emit.mockClear) io.emit.mockClear();
  });

  it('should sanitize XSS payload in direct messages', async () => {
    const maliciousMessage = '<script>alert("XSS")</script>Hello';
    const data = { recipientId: 'victim-user', message: maliciousMessage };

    await directMessageHandler(data);

    // Verify message was broadcasted
    expect(io.to).toHaveBeenCalledWith('user:victim-user');

    // CAPTURE the arguments passed to emit
    // args[0] is 'new_message', args[1] is the data object
    const emitCall = io.emit.mock.calls[0];
    const emittedData = emitCall[1];

    // EXPECTATION: The message should be sanitized
    // Currently, this test is expected to FAIL because there is no sanitization
    // If it fails with "expected '&lt;script...' but got '<script...'", that confirms the vulnerability.
    expect(emittedData.message).not.toContain('<script>');
    expect(emittedData.message).toContain('&lt;script&gt;');
  });

  it('should sanitize XSS payload in guild messages', async () => {
    const maliciousMessage = '<img src=x onerror=alert(1)>';
    const data = { guildId: 100, message: maliciousMessage };

    await guildMessageHandler(data);

    expect(io.to).toHaveBeenCalledWith('guild:100');

    const emitCall = io.emit.mock.calls[0];
    const emittedData = emitCall[1];

    expect(emittedData.message).not.toContain('<img');
    expect(emittedData.message).toContain('&lt;img');
  });
});
