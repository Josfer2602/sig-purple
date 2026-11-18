import win32com.client
import os

excel = win32com.client.DispatchEx('Excel.Application')
excel.Visible = False
excel.DisplayAlerts = False
excel.AutomationSecurity = 1 # msoAutomationSecurityLow

wb_path = os.path.abspath('../Plantilla Cotización.xlsm')
out_path = os.path.abspath('test_com2.xlsm')

print("Opening workbook...")
wb = excel.Workbooks.Open(wb_path)

print("Running macro ItemNuevo...")
excel.Application.Run("'Plantilla Cotización.xlsm'!ItemNuevo")

print("Saving...")
wb.SaveAs(out_path)
wb.Close(False)
excel.Quit()
print("COM Success")
