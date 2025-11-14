module.exports = function errorHandler(err, req, res, next) {
  const user =
    res.locals && res.locals.user ? res.locals.user : req.user || null;

  const status = err && err.status ? err.status : 500;
  const message = err && err.message ? err.message : "Something went wrong";

  if (process.env.NODE_ENV !== "production") {
    console.error("ERROR HANDLER: ", err && err.stack ? err.stack : err);
  }

  try {
    return res.status(status).render("error", {
      user,
      status,
      message,
    });
  } catch (renderErr) {
    console.error("Error rendering error.ejs:", renderErr);
    return res.status(status).send(`${status} — ${message}`);
  }
};
