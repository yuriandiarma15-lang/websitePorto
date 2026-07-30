const multer = require("multer");
const path = require("path");
const fs = require("fs");

const dir = path.join(__dirname, "..", "uploads", "pnl");

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({

    destination(req, file, cb) {
        cb(null, dir);
    },

    filename(req, file, cb) {

        const ext = path.extname(file.originalname);

        const filename =
            Date.now() + ext;

        cb(null, filename);

    }

});

module.exports = multer({
    storage
});
