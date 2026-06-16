
const { createServer } = require("http");
const Client = require("socket.io-client");
const jwt = require("jsonwebtoken");

// Mock database
jest.mock('../../config/database', () => ({
  sequelize: {
    authenticate: jest.fn().mockResolvedValue(true),
    sync: jest.fn().mockResolvedValue(true),
    define: jest.fn().mockReturnValue(class MockModel {
      static findOne = jest.fn();
      static create = jest.fn();
      static save = jest.fn();
      static findByPk = jest.fn();
    }),
    close: jest.fn().mockResolvedValue(true),
  }
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  stream: { write: jest.fn() }
}));

// Import server
const { server, io } = require('../../server');

describe("Socket XSS Prevention", () => {
  let clientSocket;
  let receiverSocket;
  let port;
  const SECRET = process.env.JWT_SECRET || 'test_secret';

  beforeAll((done) => {
    process.env.JWT_SECRET = SECRET;
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    io.close();
    server.close(done);
  });

  afterEach(() => {
    if (clientSocket && clientSocket.connected) clientSocket.disconnect();
    if (receiverSocket && receiverSocket.connected) receiverSocket.disconnect();
  });

  test("should sanitize HTML in direct messages", (done) => {
    const senderToken = jwt.sign({ userId: "sender_1", username: "hacker" }, SECRET);
    const receiverToken = jwt.sign({ userId: "receiver_1", username: "victim" }, SECRET);

    clientSocket = new Client(`http://localhost:${port}`, { auth: { token: senderToken } });
    receiverSocket = new Client(`http://localhost:${port}`, { auth: { token: receiverToken } });

    let connectedCount = 0;
    const checkStart = () => {
      connectedCount++;
      if (connectedCount === 2) {
        clientSocket.emit("send_message", {
          recipientId: "receiver_1",
          message: "<script>alert('xss')</script>Hello"
        });
      }
    };

    clientSocket.on("connect", checkStart);
    receiverSocket.on("connect", checkStart);

    receiverSocket.on("new_message", (data) => {
      try {
        // Expect escaped output
        expect(data.message).not.toContain("<script>");
        expect(data.message).toContain("&lt;script&gt;");
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  test("should sanitize HTML in guild messages", (done) => {
    const token = jwt.sign({ userId: "sender_2", username: "hacker", guilds: ["guild_A"] }, SECRET);
    clientSocket = new Client(`http://localhost:${port}`, { auth: { token } });

    // We need a second client to receive the message
    const receiverToken = jwt.sign({ userId: "receiver_2", username: "victim", guilds: ["guild_A"] }, SECRET);
    receiverSocket = new Client(`http://localhost:${port}`, { auth: { token: receiverToken } });

    let connectedCount = 0;
    const checkStart = () => {
      connectedCount++;
      if (connectedCount === 2) {
        clientSocket.emit("guild_message", {
          guildId: "guild_A",
          message: "<img src=x onerror=alert(1)>GuildMessage"
        });
      }
    };

    clientSocket.on("connect", checkStart);
    receiverSocket.on("connect", checkStart);

    receiverSocket.on("new_guild_message", (data) => {
      try {
        expect(data.message).not.toContain("<img");
        expect(data.message).toContain("&lt;img");
        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
