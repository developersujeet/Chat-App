const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");
const app = express();
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;
const usersFile = path.join(__dirname, "users.json");

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname)));

function readUsers() {
  if (!fs.existsSync(usersFile)) return {};
  return JSON.parse(fs.readFileSync(usersFile, "utf8"));
}

function writeUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function isLoggedIn(req, res, next) {
  const username = req.cookies.username;
  if (username) {
    req.username = username;
    return next();
  }
  res.redirect("/login");
}

app.set("view engine", "ejs");

app.get("/", isLoggedIn, (req, res) => {
  const users = readUsers();
  const user = users[req.username];
  const allActiveUsers = Object.keys(activeUsers); // Get all active usernames
  const filteredActiveUsers = allActiveUsers.filter(
    (user) => user !== req.username
  ); // Exclude the logged-in user

  res.render("dashboard", {
    username: req.username,
    activeUsers: filteredActiveUsers,
    email: user.email, // Pass email to the view
  });
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.get("/check-login", (req, res) => {
  const username = req.cookies.username;
  if (username) {
    res.status(200).send("User logged in");
  } else {
    res.status(200).send("User not logged in");
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie("username");
  res.status(200).send("Logged out successfully");
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const users = readUsers();

  const user = Object.values(users).find(
    (u) => u.email === email && u.password === password
  );
  if (!user) {
    return res.status(400).json({ error: "Invalid email or password" });
  }
  res.cookie("username", user.username, { maxAge: 3600000, httpOnly: true });
  res.status(200).json({ message: "Login successful", username: user.username });
});

app.get("/chat", (req, res) => {
  const selectedUsername = req.query.selectedUsername || "";
  const username = req.query.username || "DefaultUser";

  res.render("chat", { selectedUsername, username });
});

app.post("/signup", (req, res) => {
  const { username, email, password } = req.body;
  const users = readUsers();

  if (users[username] || Object.values(users).find((u) => u.email === email)) {
    return res.status(400).json({ error: "Username or email already exists" });
  }

  users[username] = {
    username,
    email,
    password,
  };
  writeUsers(users);
  res.status(200).json({ message: "Signup successful" });
});

const activeUsers = {}; // To store active users and their socket IDs

const activeChats = {};  // Object to store messages for each active chat session

io.on("connection", (socket) => {
  console.log("New user connected", socket.id);

  // Handle user registration and update active user list
  socket.on("register", (username) => {
    socket.username = username;
    activeUsers[username] = socket.id;

    // Emit the updated active users list
    io.emit("active users", Object.keys(activeUsers));
  });

  // Handle private messages
  socket.on("private message", (data) => {
    const { to, message } = data;

    // Store the message for both users involved in the chat
    if (!activeChats[to]) {
      activeChats[to] = [];
    }
    if (!activeChats[socket.username]) {
      activeChats[socket.username] = [];
    }

    // Push the message into both users' message history
    activeChats[socket.username].push({ from: socket.username, message });
    activeChats[to].push({ from: socket.username, message });

    // Emit the message to the recipient
    if (activeUsers[to]) {
      io.to(activeUsers[to]).emit("private message", {
        from: socket.username,
        message,
      });
    }
  });

  // Remove user from active users map when they disconnect
  socket.on("disconnect", () => {
    for (let username in activeUsers) {
      if (activeUsers[username] === socket.id) {
        delete activeUsers[username];
        console.log(`${username} disconnected`);

        // Emit updated active users list
        io.emit("active users", Object.keys(activeUsers));
      }
    }
  });
});

server.listen(PORT, () => {
  console.log("Server is running on port", PORT);
});