using Microsoft.AspNetCore.Mvc;

namespace Raflow.Controllers;

public sealed class HomeController : Controller { public IActionResult Index() => View(); }