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

describe('Socket Security: Guild Authorization Type Mismatch', () => {
  let mockSocket;
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
      id: 'socket-123',
      join: jest.fn(),
      on: jest.fn((event, handler) => {
        if (event === 'guild_message') {
          guildMessageHandler = handler;
        }
      }),
      emit: jest.fn(),
      user: {
        id: 'user-123',
        username: 'User',
        // In DB, IDs are usually integers, but in JWT or JSON, they might be strings.
        // Let's simulate the common case where JWT/DB has numbers, but client sends string, or vice versa.
        guilds: [100] // User has guild ID 100 (number)
      }
    };
    connectionHandler(mockSocket);
  });

  it('should ALLOW message when client sends guildId as string "100" and user has number 100', async () => {
    const data = { guildId: "100", message: 'Hello Guild 100' };

    io.to.mockClear();
    io.emit.mockClear();

    await guildMessageHandler(data);

    // After the fix, this should now be called!
    expect(io.to).toHaveBeenCalledWith('guild:100');
    expect(io.emit).toHaveBeenCalledWith('new_guild_message', expect.objectContaining({
        message: 'Hello Guild 100',
        senderId: 'user-123'
    }));
  });

  it('should FAIL when user has no guilds property (JWT issue)', async () => {
      mockSocket.user.guilds = undefined;
      const data = { guildId: 100, message: 'Hello' };

      io.to.mockClear();

      await guildMessageHandler(data);

      expect(io.to).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
          message: 'You are not a member of this guild'
      }));
  });
});
