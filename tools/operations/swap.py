"""Exchange a prepared sibling with a live path without a missing-path window."""
import ctypes
import os
import sys

libc = ctypes.CDLL(None, use_errno=True)
exchange = libc.renameat2
exchange.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
exchange.restype = ctypes.c_int
source, target = map(os.fsencode, sys.argv[1:3])
if exchange(-100, source, -100, target, 2) != 0:
    number = ctypes.get_errno()
    raise OSError(number, os.strerror(number))
