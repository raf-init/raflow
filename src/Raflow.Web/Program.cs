using Raflow.Web.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();

builder.Services.AddSingleton<RuleStore>();
builder.Services.AddSingleton<ExpressionEngine>();
builder.Services.AddSingleton<WorkflowStore>();
builder.Services.AddSingleton<SchemaValidator>();

var app = builder.Build();

_ = app.Services.GetRequiredService<WorkflowStore>();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();

app.MapControllers();

app.MapControllerRoute(
    "default",
    "{controller=Home}/{action=Index}/{id?}");

app.Run();
