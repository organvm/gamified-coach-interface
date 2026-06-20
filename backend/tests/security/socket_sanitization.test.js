
const { createServer } = require("http");
const Client = require("socket.io-client");
const jwt = require("jsonwebtoken");

// Mock database to avoid connection attempts and missing models
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

// Mock logger to suppress output
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  stream: { write: jest.fn() }
}));

// Import the actual server components
const { server, io } = require('../../server');

describe("Socket Sanitization (XSS Prevention)", () => {
  let senderSocket;
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
    if (senderSocket && senderSocket.connected) senderSocket.disconnect();
    if (receiverSocket && receiverSocket.connected) receiverSocket.disconnect();
  });

  test("should sanitize XSS payload in direct messages", (done) => {
    const senderToken = jwt.sign({ userId: "sender_1", username: "sender", role: "member" }, SECRET);
    const receiverToken = jwt.sign({ userId: "receiver_1", username: "receiver", role: "member" }, SECRET);

    senderSocket = new Client(`http://localhost:${port}`, { auth: { token: senderToken } });
    receiverSocket = new Client(`http://localhost:${port}`, { auth: { token: receiverToken } });

    const xssPayload = "<script>alert('xss')</script>Hello";

    let connectedCount = 0;
    const checkStart = () => {
      connectedCount++;
      if (connectedCount === 2) {
        senderSocket.emit("send_message", {
          recipientId: "receiver_1",
          message: xssPayload
        });
      }
    };

    senderSocket.on("connect", checkStart);
    receiverSocket.on("connect", checkStart);

    receiverSocket.on("new_message", (data) => {
      try {
        expect(data.message).not.toContain("<script>");
        // sanitize-html removes the script entirely, leaving "Hello"
        expect(data.message).toBe("Hello");
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  test("should sanitize XSS payload in guild messages", (done) => {
    const guildId = "guild_xss";
    // Important: receiver must also be in the guild to receive the message!
    const senderToken = jwt.sign({
        userId: "sender_2",
        username: "sender",
        role: "member",
        guilds: [guildId]
    }, SECRET);

    const receiverToken = jwt.sign({
        userId: "receiver_2",
        username: "receiver",
        role: "member",
        guilds: [guildId]
    }, SECRET);

    senderSocket = new Client(`http://localhost:${port}`, { auth: { token: senderToken } });
    receiverSocket = new Client(`http://localhost:${port}`, { auth: { token: receiverToken } });

    // Payload is purely malicious, so it gets stripped to empty string, and server does NOT emit.
    const xssPayload = "<img src=x onerror=alert(1)>";

    let connectedCount = 0;
    const checkStart = () => {
      connectedCount++;
      if (connectedCount === 2) {
        senderSocket.emit("guild_message", {
          guildId: guildId,
          message: xssPayload
        });

        // Also send a valid message afterwards to ensure the channel is working
        // and to give us something to assert on if the first one is dropped
        setTimeout(() => {
           senderSocket.emit("guild_message", {
              guildId: guildId,
              message: "Safe Message"
           });
        }, 100);
      }
    };

    senderSocket.on("connect", checkStart);
    receiverSocket.on("connect", checkStart);

    receiverSocket.on("new_guild_message", (data) => {
      try {
        // We should ONLY receive "Safe Message" if the XSS one was dropped
        expect(data.message).not.toContain("<img");

        if (data.message === "Safe Message") {
           done();
        }
      } catch (e) {
        done(e);
      }
    });
  });
});
