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

// Import server (this will execute the io.on('connection') code)
// We need to silence logger to keep test output clean
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    stream: { write: jest.fn() }
}));

const { app, io, server } = require('../../server');

describe('Socket Security: XSS Prevention', () => {
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
      id: 'socket-xss',
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
        id: 'user-xss',
        username: 'Attacker',
        guilds: [100]
      }
    };

    // Simulate connection
    connectionHandler(mockSocket);
  });

  it('should sanitize HTML in direct messages', async () => {
    const xssPayload = '<script>alert("XSS")</script>Hello';
    const data = { recipientId: 'victim-123', message: xssPayload };

    // Clear mocks
    io.to.mockClear();
    io.emit.mockClear();

    await sendMessageHandler(data);

    // Get the arguments passed to emit
    // io.to().emit('new_message', payload)
    // The mock returns 'this' for 'to()', so we check calls to 'emit' on the 'io' object (or the object returned by to())
    // Since mockSocketIo returns an object where to() returns itself (this), io.emit should be called.

    expect(io.emit).toHaveBeenCalledWith('new_message', expect.objectContaining({
        senderId: 'user-xss',
    }));

    const emitCall = io.emit.mock.calls.find(call => call[0] === 'new_message');
    const emittedMessage = emitCall[1].message;

    // We expect the message to NOT contain the raw script tag
    expect(emittedMessage).not.toContain('<script>');
    expect(emittedMessage).toContain('&lt;script&gt;');
  });

  it('should sanitize HTML in guild messages', async () => {
    const xssPayload = '<img src=x onerror=alert(1)>';
    const data = { guildId: 100, message: xssPayload };

    // Clear mocks
    io.to.mockClear();
    io.emit.mockClear();

    await guildMessageHandler(data);

    expect(io.emit).toHaveBeenCalledWith('new_guild_message', expect.objectContaining({
        senderId: 'user-xss',
    }));

    const emitCall = io.emit.mock.calls.find(call => call[0] === 'new_guild_message');
    const emittedMessage = emitCall[1].message;

    // We expect the message to NOT contain the raw img tag
    expect(emittedMessage).not.toContain('<img');
    expect(emittedMessage).toContain('&lt;img');
  });
});
